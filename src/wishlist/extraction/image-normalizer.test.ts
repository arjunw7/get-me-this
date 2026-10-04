import { describe, expect, it, vi } from "vitest";

import sharp from "sharp";

vi.mock("server-only", () => ({}));

const { normalizeCandidateImage } = await import("./image-normalizer");
type PinnedConnection = import("./transport").PinnedConnection;

class ImageConnection implements PinnedConnection {
  readonly remoteAddress = "8.8.8.8";
  writes = 0;
  destroyed = false;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly contentType: string,
  ) {}

  write(): void {
    this.writes += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    const header = new TextEncoder().encode(
      [
        "HTTP/1.1 200 OK",
        `Content-Type: ${this.contentType}`,
        `Content-Length: ${this.bytes.length}`,
        "",
        "",
      ].join("\r\n"),
    );
    const combined = new Uint8Array(header.length + this.bytes.length);
    combined.set(header);
    combined.set(this.bytes, header.length);
    yield combined;
  }
}

function transport(bytes: Uint8Array, contentType: string) {
  const connection = new ImageConnection(bytes, contentType);
  const dial = vi.fn(async () => connection);
  return {
    connection,
    dial,
    dependencies: {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
      dial,
    },
  };
}

describe("candidate image normalization", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)(
    "normalizes a static %s to bounded metadata-free WebP",
    async (format, type) => {
      const input = await sharp({
        create: {
          width: 2_000,
          height: 1_000,
          channels: 3,
          background: "red",
        },
      })
        [format]()
        .toBuffer();
      const fixture = transport(input, type);
      const output = await normalizeCandidateImage(
        "https://images.example/item",
        {
          transport: fixture.dependencies,
        },
      );
      expect(output).not.toBeNull();
      const metadata = await sharp(output!).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(1_600);
      expect(metadata.height).toBe(800);
      expect(metadata.pages ?? 1).toBe(1);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(output!.length).toBeLessThanOrEqual(2 * 1_024 * 1_024);
      expect(fixture.connection.destroyed).toBe(true);
    },
  );

  it("rejects a declared/sniffed format mismatch", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const fixture = transport(png, "image/jpeg");
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("rejects a valid image with trailing polyglot bytes", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const suffix = new TextEncoder().encode("<script>x</script>");
    const polyglot = new Uint8Array(png.length + suffix.length);
    polyglot.set(png);
    polyglot.set(suffix, png.length);
    const fixture = transport(polyglot, "image/png");
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("rejects dimensions over 8,192 pixels", async () => {
    const png = await sharp({
      create: { width: 8_193, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const fixture = transport(png, "image/png");
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("rejects images over twenty million pixels", async () => {
    const png = await sharp({
      create: { width: 5_001, height: 4_000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const fixture = transport(png, "image/png");
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("rejects corrupt bytes with an otherwise allowed declared type", async () => {
    const fixture = transport(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
      "image/png",
    );
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("rejects animated WebP input", async () => {
    const first = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();
    const second = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "black" },
    })
      .png()
      .toBuffer();
    const animated = await sharp([first, second], {
      join: { animated: true },
    })
      .webp({ delay: [100, 100], loop: 0 })
      .toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(
      2,
    );
    const fixture = transport(animated, "image/webp");
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });

  it("strips source EXIF metadata from the WebP output", async () => {
    const jpeg = await sharp({
      create: { width: 100, height: 50, channels: 3, background: "white" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "fixture-secret" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const fixture = transport(jpeg, "image/jpeg");
    const output = await normalizeCandidateImage(
      "https://images.example/item",
      { transport: fixture.dependencies },
    );
    expect(output).not.toBeNull();
    expect((await sharp(output!).metadata()).exif).toBeUndefined();
  });

  it("does not start normalization after the total deadline", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const fixture = transport(png, "image/png");
    const deadline = Date.now() + 10_000;
    const output = await normalizeCandidateImage(
      "https://images.example/item",
      {
        transport: fixture.dependencies,
        deadline,
        now: () => deadline,
      },
    );
    expect(output).toBeNull();
  });

  it("makes zero dials for a blocked candidate", async () => {
    const dial = vi.fn();
    const output = await normalizeCandidateImage("http://127.0.0.1/image.png", {
      transport: { resolve: vi.fn(), dial },
    });
    expect(output).toBeNull();
    expect(dial).not.toHaveBeenCalled();
  });

  it.each([
    ["image/svg+xml", new TextEncoder().encode("<svg/>")],
    ["image/gif", new Uint8Array([0x47, 0x49, 0x46, 0x38])],
    ["image/avif", new Uint8Array([0, 0, 0, 0])],
  ])("rejects unsupported declared content type %s", async (type, bytes) => {
    const fixture = transport(bytes, type);
    expect(
      await normalizeCandidateImage("https://images.example/item", {
        transport: fixture.dependencies,
      }),
    ).toBeNull();
  });
});
