import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractProductLink } = await import("./extractor");
type PinnedConnection = import("./transport").PinnedConnection;

const encoder = new TextEncoder();

class HtmlConnection implements PinnedConnection {
  readonly remoteAddress = "8.8.8.8";
  writes = 0;
  destroyed = false;

  constructor(private readonly html: string) {}

  write(): void {
    this.writes += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    yield encoder.encode(
      [
        "HTTP/1.1 200 OK",
        "Content-Type: text/html; charset=utf-8",
        `Content-Length: ${encoder.encode(this.html).length}`,
        "",
        this.html,
      ].join("\r\n"),
    );
  }
}

function transport(html: string) {
  const connection = new HtmlConnection(html);
  return {
    connection,
    dependencies: {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
      dial: vi.fn(async () => connection),
    },
  };
}

describe("inert bounded metadata extraction", () => {
  it("uses deterministic metadata precedence and exact string money", async () => {
    const fixture = transport(`<!doctype html><html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="  Safer  title  ">
      <meta property="og:site_name" content="Example Shop">
      <meta property="og:image" content="/images/a.jpg">
      <meta property="product:price:amount" content="123.45">
      <meta property="product:price:currency" content="INR">
      <script type="application/ld+json">{"@type":"Product","name":"JSON title","image":["/images/a.jpg","https://images.example/b.png"]}</script>
      </head></html>`);
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result).toEqual({
      sourceUrl: "https://shop.example/item",
      title: "Safer title",
      retailer: "Example Shop",
      originalAmountMinor: "12345",
      originalCurrency: "INR",
      candidateImageUrls: [
        "https://shop.example/images/a.jpg",
        "https://images.example/b.png",
      ],
    });
    expect(fixture.connection.writes).toBe(1);
    expect(fixture.connection.destroyed).toBe(true);
  });

  it("treats JSON numeric prices as ambiguous without losing other metadata", async () => {
    const fixture = transport(
      `<script type="application/ld+json">{"@type":"Product","name":"Gift","offers":{"price":12.34,"priceCurrency":"USD"}}</script>`,
    );
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Gift");
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
  });

  it("does not execute scripts or load page resources", async () => {
    const fixture = transport(`
      <script>throw new Error("must not run")</script>
      <img src="https://tracking.example/pixel">
      <link rel="stylesheet" href="https://tracking.example/style.css">
      <title>Still safe</title>`);
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Still safe");
    expect(fixture.dependencies.resolve).toHaveBeenCalledOnce();
    expect(fixture.dependencies.dial).toHaveBeenCalledOnce();
  });

  it("never returns markup from title or retailer metadata", async () => {
    const fixture = transport(`
      <script type="application/ld+json">
        {"@type":"Product","name":"<strong>Gift</strong>","brand":"<em>Shop</em>"}
      </script>`);
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Gift");
    expect(result.retailer).toBe("Shop");
    expect(JSON.stringify(result)).not.toMatch(/[<>]/);
  });

  it("degrades malformed HTML to a safe partial proposal", async () => {
    const fixture = transport("<html><title>Partial gift<meta broken");
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.sourceUrl).toBe("https://shop.example/item");
    expect(result.candidateImageUrls).toEqual([]);
  });

  it("fails closed when HTML nesting exceeds 64", async () => {
    const fixture = transport(
      `${"<div>".repeat(65)}gift${"</div>".repeat(65)}`,
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed when raw image candidate work exceeds 32", async () => {
    const images = Array.from(
      { length: 33 },
      (_, index) => `/image-${index}.jpg`,
    );
    const fixture = transport(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", image: images })}</script>`,
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above the 50,000 parsed-node cap", async () => {
    const fixture = transport("<br>".repeat(50_001));
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above sixteen JSON-LD blocks", async () => {
    const fixture = transport(
      '<script type="application/ld+json">{}</script>'.repeat(17),
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above 128 KiB aggregate JSON-LD source", async () => {
    const block = `<script type="application/ld+json">{}${" ".repeat(8_200)}</script>`;
    const fixture = transport(block.repeat(16));
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above an 8 KiB metadata value", async () => {
    const fixture = transport(
      `<meta property="og:title" content="${"x".repeat(8_193)}">`,
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above 32 KiB aggregate candidate URL text", async () => {
    const images = Array.from(
      { length: 5 },
      (_, index) => `https://images.example/${index}/${"x".repeat(6_600)}`,
    );
    const fixture = transport(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", image: images })}</script>`,
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("fails closed above JSON-LD depth eight", async () => {
    let nested: Record<string, unknown> = { value: "end" };
    for (let index = 0; index < 9; index += 1) nested = { child: nested };
    const fixture = transport(
      `<script type="application/ld+json">${JSON.stringify(nested)}</script>`,
    );
    await expect(
      extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });
});
