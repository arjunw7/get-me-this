import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { Wordmark } from "@/src/landing/wordmark";
import type { InvitationSharePreview } from "./share-preview-data";
import { INVITATION_PREVIEW_HEADERS } from "./share-preview-response";

// Images use the application's semantic palette and same licensed fonts.
// TTF instances are derived from the checked-in WOFF2 files, never a CDN.
async function assets() {
  const [css, displayFont, bodyFont, giftMark] = await Promise.all([
    readFile(join(process.cwd(), "app/tokens.css"), "utf8"),
    readFile(
      join(process.cwd(), "app/fonts/bricolage-grotesque-share-bold.ttf"),
    ),
    readFile(join(process.cwd(), "app/fonts/dm-sans-share-regular.ttf")),
    readFile(join(process.cwd(), "public/assets/brand/gift-mark.svg")),
  ]);
  const color = (name: string) => {
    const value = new RegExp(`--color-${name}:\\s*(#[a-fA-F0-9]{6});`).exec(
      css,
    )?.[1];
    if (!value) throw new Error("Missing share image design token");
    return value;
  };
  return {
    paper: color("surface-page"),
    ink: color("content-primary"),
    yellow: color("accent-highlight"),
    tomato: color("action-primary"),
    blue: color("accent-info"),
    lime: color("accent-fresh"),
    displayFont,
    bodyFont,
    giftMark: `data:image/svg+xml;base64,${giftMark.toString("base64")}`,
  };
}

export async function invitationShareImage(preview: InvitationSharePreview) {
  const c = await assets();
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: "42px 48px",
        background: c.paper,
        color: c.ink,
        fontFamily: "DM Sans",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          height: 76,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Wordmark imageColors={{ ink: c.ink, accent: c.tomato }} />
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span
            style={{
              background: c.blue,
              color: c.paper,
              padding: "13px 24px",
              fontSize: 26,
              border: `2px solid ${c.ink}`,
              borderRadius: 12,
              transform: "rotate(-4deg)",
              boxShadow: `4px 4px 0 ${c.ink}`,
            }}
          >
            You&apos;re invited!
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.giftMark}
            width={76}
            height={76}
            alt=""
            style={{ transform: "rotate(9deg)" }}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          marginTop: 30,
          height: 280,
          flexShrink: 0,
          background: c.yellow,
          border: `3px solid ${c.ink}`,
          borderRadius: 32,
          boxShadow: `9px 9px 0 ${c.ink}`,
          padding: "30px 46px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            fontFamily: "Bricolage Grotesque",
            fontWeight: 800,
            fontSize:
              preview.groupName.length > 90
                ? 36
                : preview.groupName.length > 65
                  ? 44
                  : preview.groupName.length > 38
                    ? 60
                    : 84,
            lineHeight: 1.02,
            letterSpacing: -2,
            wordBreak: "break-word",
          }}
        >
          {preview.groupName}
        </div>
        <svg
          width="62"
          height="62"
          viewBox="0 0 64 64"
          style={{
            position: "absolute",
            right: -19,
            top: -24,
            transform: "rotate(12deg)",
          }}
        >
          <path
            d="M32 2 L39 23 L61 17 L45 34 L60 50 L38 43 L31 63 L25 42 L3 48 L19 32 L3 15 L25 23 Z"
            fill={c.lime}
            stroke={c.ink}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div style={{ display: "flex", marginTop: 32, height: 92, gap: 24 }}>
        <div
          style={{
            display: "flex",
            width: 646,
            flexDirection: "column",
            justifyContent: "center",
            padding: "12px 24px",
            border: `2px solid ${c.ink}`,
            borderRadius: 18,
            background: c.paper,
            boxShadow: `5px 5px 0 ${c.tomato}`,
          }}
        >
          <span style={{ fontSize: 17, marginBottom: 4 }}>YOUR HOST</span>
          <span
            style={{
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize:
                preview.organizerName.length > 90
                  ? 14
                  : preview.organizerName.length > 60
                    ? 20
                    : preview.organizerName.length > 30
                      ? 26
                      : 34,
              lineHeight: 1.1,
            }}
          >
            {preview.organizerName}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            background: c.lime,
            border: `2px solid ${c.ink}`,
            borderRadius: 18,
            boxShadow: `5px 5px 0 ${c.ink}`,
            transform: "rotate(2deg)",
            fontSize: 27,
          }}
        >
          {preview.date}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: INVITATION_PREVIEW_HEADERS,
      fonts: [
        { name: "Bricolage Grotesque", data: c.displayFont, weight: 800 },
        { name: "DM Sans", data: c.bodyFont, weight: 400 },
      ],
    },
  );
}
