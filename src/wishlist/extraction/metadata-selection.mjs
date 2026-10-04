// Conservative helpers for inert HTML metadata. Unknown named entities stay
// unchanged; JSON-LD strings must not be decoded as HTML a second time.
const ENTITIES = Object.freeze({
  amp: "&",
  AMP: "&",
  quot: '"',
  QUOT: '"',
  apos: "'",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  nbsp: "\u00a0",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  pound: "£",
  euro: "€",
  yen: "¥",
  cent: "¢",
});

export function decodeHtmlEntities(value) {
  return value.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,15});/gi,
    (whole, entity) => {
      if (!entity.startsWith("#"))
        return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : whole;
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(
        entity.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(code);
    },
  );
}

function identity(value, base) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, base);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function selectIdentifiedRecord(records, finalUrl, canonicalUrl) {
  if (!records.length) return null;
  const target = identity(finalUrl, finalUrl);
  const identifiers = (record) =>
    // A generic page-fragment @id must not override a different variant URL.
    [record?.url ?? record?.["@id"]]
      .map((value) => identity(value, finalUrl))
      .filter(Boolean);
  const exact = records.filter((record) =>
    identifiers(record).includes(target),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  // A canonical URL often removes a variant selector. Never use it to erase
  // query context, or follow a cross-origin canonical declaration.
  const final = new URL(finalUrl);
  const canonical = identity(canonicalUrl, finalUrl);
  if (
    canonical &&
    !final.search &&
    new URL(canonical).origin === final.origin
  ) {
    const matches = records.filter((record) =>
      identifiers(record).includes(canonical),
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return records.length === 1 && identifiers(records[0]).length === 0
    ? records[0]
    : null;
}

export function isChallengePage(html, title) {
  const challengeTitle =
    /^(?:just a moment\.{0,3}|attention required!?|robot check|access denied|security check|verify you are human)$/i.test(
      title?.trim() ?? "",
    );
  return (
    challengeTitle &&
    /(?:\/cdn-cgi\/challenge-platform\/|cf-chl-|validateCaptcha|verify (?:that )?you are human|automated access|captcha)/i.test(
      html,
    )
  );
}
