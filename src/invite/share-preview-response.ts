import "server-only";
import { createHash } from "node:crypto";
import { publicSiteOrigin } from "@/src/brand/metadata";
import { isCanonicalOpaqueToken } from "./token";
import { loadInvitationSharePreview } from "./share-preview-data";

// This selects representation, never authorization: spoofing an agent grants
// only the same three-field projection available to any valid link holder.
export { isSharePreviewAgent } from "./share-preview-agent";

export const INVITATION_PREVIEW_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  Vary: "User-Agent",
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export async function invitationShareResponse(
  token: string,
): Promise<Response> {
  const digest = isCanonicalOpaqueToken(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;
  const preview = digest ? await loadInvitationSharePreview(digest) : null;
  const title = preview
    ? `You're invited to ${preview.groupName}`
    : "Group invitation | Get Me This";
  const description = preview
    ? `Hosted by ${preview.organizerName} · ${preview.date}`
    : "Open this invitation in your browser to continue.";
  const origin = publicSiteOrigin(process.env);
  const image =
    preview && origin
      ? new URL(`/invite/preview/${digest}/image`, origin).href
      : null;
  const meta = (property: string, value: string) =>
    `<meta property="${property}" content="${escapeHtml(value)}">`;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escapeHtml(title)}</title>${meta("og:type", "website")}${meta("og:site_name", "Get Me This")}${meta("og:title", title)}${meta("og:description", description)}${image ? `${meta("og:image", image)}${meta("og:image:width", "1200")}${meta("og:image:height", "630")}${meta("og:image:alt", `${title}. ${description}`)}` : ""}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}">${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}</head><body>${escapeHtml(title)}. ${escapeHtml(description)}</body></html>`,
    {
      headers: {
        ...INVITATION_PREVIEW_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    },
  );
}
