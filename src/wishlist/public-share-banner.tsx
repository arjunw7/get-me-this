import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { profileInitials } from "@/src/home/profile-initials";
import type { Vibe } from "@/src/profile/vibe";
import type { PublicWishlistView } from "./public-share-types";
import { PUBLIC_SHARE_IMAGE_HEADERS } from "./public-share-image-response";

const vibeToken: Record<Vibe, string> = {
  tomato: "action-primary",
  marigold: "accent-highlight",
  electric: "accent-info",
  acid_lime: "accent-fresh",
};

export async function publicWishlistBanner(
  snapshot: Pick<
    PublicWishlistView,
    "displayName" | "tasteLine" | "vibe" | "items"
  >,
) {
  const [css, displayFont, bodyFont, gift] = await Promise.all([
    readFile(join(process.cwd(), "app/tokens.css"), "utf8"),
    readFile(
      join(process.cwd(), "app/fonts/bricolage-grotesque-share-bold.ttf"),
    ),
    readFile(join(process.cwd(), "app/fonts/dm-sans-share-regular.ttf")),
    readFile(join(process.cwd(), "public/assets/brand/gift-mark.svg")),
  ]);
  const color = (token: string) => {
    const value = new RegExp(`--color-${token}:\\s*(#[a-fA-F0-9]{6});`).exec(
      css,
    )?.[1];
    if (!value) throw new Error("Missing share image design token");
    return value;
  };
  const ink = color("content-primary"),
    paper = color("surface-page");
  const accent = color(vibeToken[snapshot.vibe]);
  const foreground =
    snapshot.vibe === "electric" ? color("surface-raised") : ink;
  const name = snapshot.displayName;
  const title = `${name}’s wishlist`;
  const titleSize =
    title.length > 75
      ? 30
      : title.length > 45
        ? 42
        : title.length > 28
          ? 54
          : 68;
  const count = snapshot.items.length;
  const tasteLine =
    snapshot.tasteLine && snapshot.tasteLine.length > 100
      ? `${snapshot.tasteLine.slice(0, 97)}…`
      : snapshot.tasteLine;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "42px 48px",
        background: paper,
        color: ink,
        fontFamily: "DM Sans",
      }}
    >
      <div
        style={{ display: "flex", height: 76, alignItems: "center", gap: 16 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;base64,${gift.toString("base64")}`}
          width={76}
          height={76}
          alt=""
        />
        <div
          style={{
            display: "flex",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: -1.5,
          }}
        >
          get me{" "}
          <span style={{ color: color("action-primary"), marginLeft: 8 }}>
            this.
          </span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          flexDirection: "column",
          marginTop: 30,
          height: 405,
          flexShrink: 0,
          background: accent,
          color: foreground,
          border: `3px solid ${ink}`,
          borderRadius: 32,
          boxShadow: `9px 9px 0 ${ink}`,
          padding: "34px 42px",
          overflow: "hidden",
        }}
      >
        <svg
          width="750"
          height="150"
          viewBox="0 0 750 150"
          style={{ position: "absolute", right: -30, top: 30, opacity: 0.22 }}
        >
          <path
            d="M0 80 C 180 180 320 -30 470 60 S 640 130 760 70"
            fill="none"
            stroke={foreground}
            strokeWidth="5"
            strokeDasharray="3 22"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 94,
              height: 94,
              flexShrink: 0,
              border: `3px solid ${ink}`,
              borderRadius: 100,
              boxShadow: `0 0 0 5px ${paper}`,
              background: accent,
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 48,
            }}
          >
            {profileInitials(name)}
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: titleSize,
              lineHeight: 1.03,
              letterSpacing: -2.5,
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>
        </div>
        {tasteLine ? (
          <div
            style={{
              display: "flex",
              fontSize: 29,
              marginTop: 28,
              lineHeight: 1.2,
              wordBreak: "break-word",
            }}
          >
            {tasteLine}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 30,
            left: 42,
            right: 42,
            alignItems: "center",
            justifyContent: "space-between",
            gap: 25,
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "14px 22px",
              background: paper,
              color: ink,
              border: `2px solid ${ink}`,
              borderRadius: 18,
              fontSize: 26,
            }}
          >
            {count === 1 ? "1 thing I’d love" : `${count} things I’d love`}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 30,
              alignItems: "center",
              gap: 16,
            }}
          >
            Take a peek{" "}
            <svg width="44" height="44" viewBox="0 0 44 44">
              <path
                d="M5 39 39 5M14 5h25v25"
                fill="none"
                stroke={foreground}
                strokeWidth="3"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: PUBLIC_SHARE_IMAGE_HEADERS,
      fonts: [
        { name: "Bricolage Grotesque", data: displayFont, weight: 800 },
        { name: "DM Sans", data: bodyFont, weight: 400 },
      ],
    },
  );
}
