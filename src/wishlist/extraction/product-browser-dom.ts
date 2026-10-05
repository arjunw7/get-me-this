/** Fixed DOM reader executed in the isolated renderer, with bounded JSON traversal. */
export function readProductDom() {
  const clip = (value: unknown, limit = 2048) =>
    typeof value === "string" ? value.slice(0, limit) : null;
  const meta = (name: string) =>
    clip(
      document.querySelector<HTMLMetaElement>(
        `meta[property="${name}"],meta[name="${name}"]`,
      )?.content,
    );
  const products: Record<string, unknown>[] = [];
  let nodes = 0;
  const scan = (value: unknown, depth = 0): void => {
    if (++nodes > 5000 || depth > 8 || !value || typeof value !== "object")
      return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 100)) scan(child, depth + 1);
      return;
    }
    const item = value as Record<string, unknown>;
    if (
      (Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]]).includes(
        "Product",
      ) &&
      products.length < 8
    )
      products.push(item);
    scan(item["@graph"], depth + 1);
    scan(item.mainEntity, depth + 1);
  };
  let jsonBytes = 0;
  for (const element of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).slice(0, 16)) {
    const text = element.textContent ?? "";
    jsonBytes += text.length;
    if (jsonBytes > 128 * 1024) break;
    try {
      scan(JSON.parse(text));
    } catch {
      /* Broken metadata is ignored. */
    }
  }
  const heading = clip(document.querySelector("h1")?.textContent, 400);
  const ogTitle = meta("og:title");
  const matching = products.filter(
    (p) =>
      typeof p.name === "string" &&
      [heading, ogTitle].some(
        (title) =>
          title?.trim().toLowerCase() ===
          (p.name as string).trim().toLowerCase(),
      ),
  );
  const product =
    matching.length === 1
      ? matching[0]
      : products.length === 1 && !heading && !ogTitle
        ? products[0]
        : undefined;
  const offers = product?.offers;
  const offer = (
    Array.isArray(offers) ? (offers.length === 1 ? offers[0] : null) : offers
  ) as Record<string, unknown> | null;
  const images = (
    Array.isArray(product?.image) ? product.image : [product?.image]
  )
    .slice(0, 8)
    .map((image) =>
      clip(
        typeof image === "object" && image
          ? (image as Record<string, unknown>).url
          : image,
        2048,
      ),
    )
    .filter(Boolean);
  const body = (
    document.body?.innerText ??
    document.body?.textContent ??
    ""
  ).slice(0, 2500);
  const blocked =
    !!document.querySelector(
      'input#captchacharacters,form[action*="validateCaptcha"]',
    ) ||
    /access denied|verify you are human|unusual traffic|robot check|just a moment/i.test(
      body.slice(0, 1500),
    );
  const unavailable = /outofstock|soldout|discontinued/i.test(
    String(offer?.availability ?? ""),
  );
  return {
    title: clip(product?.name, 400) ?? ogTitle ?? heading,
    productUrl: clip(product?.url),
    pageTitle: ogTitle ?? heading,
    pageImage: meta("og:image"),
    canonical: clip(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ),
    images: images.length ? images : [meta("og:image")].filter(Boolean),
    price:
      !unavailable &&
      offer &&
      offer["@type"] !== "AggregateOffer" &&
      (typeof offer.price === "string" || typeof offer.price === "number")
        ? String(offer.price).slice(0, 64)
        : null,
    currency:
      !unavailable &&
      typeof offer?.priceCurrency === "string" &&
      /^[A-Z]{3}$/u.test(offer.priceCurrency)
        ? offer.priceCurrency
        : null,
    body,
    blocked,
  };
}
