import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  createBrandMetadata,
  publicSiteOrigin,
  SHARE_IMAGE_ALT,
} from "./metadata";

describe("public brand previews", () => {
  it("resolves a public absolute image URL from the canonical origin", () => {
    const metadata = createBrandMetadata({
      APP_ORIGIN: "https://gifts.example",
    });
    expect(metadata.metadataBase?.toString()).toBe("https://gifts.example/");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://gifts.example/assets/brand/share-banner-v2.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: SHARE_IMAGE_ALT,
      },
    ]);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: metadata.openGraph?.images,
    });
    // No canonical/home URL is inherited by token-bearing shared pages.
    expect(metadata.openGraph).not.toHaveProperty("url");
    expect(metadata).not.toHaveProperty("alternates");
  });

  it("supports Railway preview domains and prioritizes APP_ORIGIN", () => {
    expect(
      publicSiteOrigin({ RAILWAY_PUBLIC_DOMAIN: "preview.up.railway.app" })
        ?.href,
    ).toBe("https://preview.up.railway.app/");
    expect(
      publicSiteOrigin({
        APP_ORIGIN: "https://gifts.example",
        RAILWAY_PUBLIC_DOMAIN: "preview.up.railway.app",
      })?.href,
    ).toBe("https://gifts.example/");
  });

  it.each([
    "not a url",
    "ftp://gifts.example",
    "https://user:secret@gifts.example",
    "https://gifts.example/private",
    "https://gifts.example?token=private",
    "https://gifts.example/#private",
  ])(
    "does not publish an invalid or credential-bearing configured origin: %s",
    (value) => {
      const metadata = createBrandMetadata({ APP_ORIGIN: value });
      expect(metadata.metadataBase).toBeUndefined();
      expect(metadata.openGraph?.images).toEqual([]);
    },
  );

  it("never guesses localhost for an unconfigured production deployment", () => {
    expect(
      createBrandMetadata({ NODE_ENV: "production" }).openGraph?.images,
    ).toEqual([]);
    expect(publicSiteOrigin({ NODE_ENV: "development" })?.href).toBe(
      "http://localhost:3000/",
    );
  });

  it("ships a crawler-readable 1200×630 PNG and browser/touch icons", async () => {
    const banner = await sharp(
      resolve("public/assets/brand/share-banner-v2.png"),
    ).metadata();
    expect(banner).toMatchObject({ format: "png", width: 1200, height: 630 });
    expect(
      readFileSync(resolve("public/assets/brand/share-banner-v2.png")).length,
    ).toBeLessThan(300_000);
    expect(await sharp(resolve("app/icon.png")).metadata()).toMatchObject({
      width: 512,
      height: 512,
    });
    expect(await sharp(resolve("app/apple-icon.png")).metadata()).toMatchObject(
      { width: 180, height: 180 },
    );
    const ico = readFileSync(resolve("app/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
  });
});
