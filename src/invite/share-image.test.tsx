import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { invitationShareImage } from "./share-image";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ load: vi.fn(), allowed: vi.fn() }));
vi.mock("./share-preview-data", () => ({
  loadInvitationSharePreview: mocks.load,
}));
vi.mock("./landing-guard", () => ({
  enforceInviteLandingLimit: mocks.allowed,
}));
import { GET } from "../../app/invite/preview/[digest]/image/route";

it("renders a real 1200×630 PNG for a valid invitation without setting cookies", async () => {
  mocks.allowed.mockResolvedValue(true);
  mocks.load.mockResolvedValue({
    groupName: "Wadhwa Diwali Squad",
    organizerName: "Arjun Wadhwa",
    date: "Fri, 6 Nov, 2026",
  });
  const response = await GET(new Request("https://getmethis.fun"), {
    params: Promise.resolve({ digest: "a".repeat(64) }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  const metadata = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  expect(metadata).toMatchObject({ width: 1200, height: 630, format: "png" });
});

it("returns a generic non-cacheable failure for revoked or denied previews", async () => {
  mocks.allowed.mockResolvedValue(true);
  mocks.load.mockResolvedValue(null);
  const response = await GET(new Request("https://getmethis.fun"), {
    params: Promise.resolve({ digest: "a".repeat(64) }),
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("Preview unavailable");
});

it("renders long names with embedded app fonts and no external asset fetch", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("unexpected external asset"));
  try {
    const response = await invitationShareImage({
      groupName: "W".repeat(120),
      organizerName: "W".repeat(120),
      date: "Fri, 6 Nov, 2026",
    });
    expect(
      (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,
    ).toBe(1200);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
