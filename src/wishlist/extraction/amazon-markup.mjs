// Inert, bounded fallbacks for Amazon India product HTML. No scripts run,
// no extra resources load, and currency must be explicitly present.
export function amazonProductMetadata(html, attrs, maximumValue) {
  function byId(tag, id) {
    const expression = new RegExp(
      `<${tag}\\b([^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)>`,
      "i",
    );
    const match = expression.exec(html);
    return match
      ? { attributes: attrs(match[1]), end: match.index + match[0].length }
      : null;
  }
  function byClass(source, name) {
    for (const match of source.matchAll(/<span\b([^>]*)>/gi)) {
      if (!match[1].includes(name)) continue;
      if (!(attrs(match[1]).class || "").split(/\s+/).includes(name)) continue;
      return match.index + match[0].length;
    }
    return null;
  }
  function spanContent(source, start) {
    const bounded = source.slice(start, start + maximumValue);
    let depth = 1;
    for (const match of bounded.matchAll(/<\/?span\b[^>]*>/gi)) {
      depth += match[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return bounded.slice(0, match.index);
    }
    return null;
  }
  const titleTag = byId("span", "productTitle");
  let title;
  if (titleTag) {
    const end = html.indexOf("</span>", titleTag.end);
    if (end >= titleTag.end && end - titleTag.end <= maximumValue) {
      title = html.slice(titleTag.end, end);
    }
  }
  const photo = byId("img", "landingImage")?.attributes;
  const image = photo?.["data-old-hires"] || photo?.src;
  const currencyCodes = new Set(
    Array.from(
      html.matchAll(/"currencyInfo"\s*:\s*\{\s*"code"\s*:\s*"([A-Z]{3})"/g),
      (match) => match[1],
    ),
  );
  const currency = currencyCodes.size === 1 ? [...currencyCodes][0] : undefined;
  const priceStart =
    byClass(html, "priceToPay") ?? byClass(html, "apex-pricetopay-value");
  let price;
  if (priceStart !== null && currency) {
    // Stop at the current-price container, before MRP or recommendations.
    // An incomplete prefix must not supply an amount.
    const region = spanContent(html, priceStart) ?? "";
    const wholeStart = byClass(region, "a-price-whole");
    const fractionStart = byClass(region, "a-price-fraction");
    if (wholeStart !== null) {
      const whole = (spanContent(region, wholeStart) ?? "")
        .replace(/<[^>]*>/g, "")
        .trim()
        .replace(/\.$/, "");
      const fraction =
        fractionStart === null
          ? null
          : spanContent(region, fractionStart)?.trim();
      if (
        /^\d+(?:,\d{2,3})*$/.test(whole) &&
        (fraction === null ||
          (typeof fraction === "string" && /^\d{2}$/.test(fraction)))
      ) {
        price = `${whole.replaceAll(",", "")}${fraction === null ? "" : `.${fraction}`}`;
      }
    }
  }
  return {
    title,
    retailer: title || image ? "Amazon" : undefined,
    image,
    price,
    currency: price ? currency : undefined,
  };
}
