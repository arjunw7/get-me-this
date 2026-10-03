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
  it("decodes HTML text and image attributes once, before URL validation", async () => {
    const fixture = transport(`<title>Fallback</title>
      <meta property="og:title" content="Tea &amp; Coffee &#x1f381; &#39;gift&#39; &constructor;">
      <meta property="og:site_name" content="Tom &amp; Co">
      <meta property="og:image" content="https://images.example/a.jpg?x=1&amp;y=2">
      <meta property="product:price:amount" content="&#49;2.00">
      <meta property="product:price:currency" content="USD">`);
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result).toMatchObject({
      title: "Tea & Coffee 🎁 'gift' &constructor;",
      retailer: "Tom & Co",
      originalAmountMinor: "1200",
      candidateImageUrls: ["https://images.example/a.jpg?x=1&y=2"],
    });
  });

  it("does not decode literal HTML entity text inside JSON-LD", async () => {
    const fixture = transport(
      '<script type="application/ld+json">{"@type":"Product","name":"Literal &amp; token"}</script>',
    );
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Literal &amp; token");
  });

  it.each([null, { name: "Myntra" }])(
    "never treats a product brand as the shop (seller %j)",
    async (seller) => {
      const fixture = transport(
        `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Shoe", brand: { name: "Nike" }, offers: { seller } })}</script>`,
      );
      const result = await extractProductLink("https://shop.example/item", {
        transport: fixture.dependencies,
      });
      expect(result.retailer).toBe(seller?.name ?? null);
    },
  );

  it.each([
    "<title>Just a moment...</title><body>Please verify you are human</body>",
    '<title>Robot Check</title><form action="/errors/validateCaptcha">Check</form>',
    '<title>Attention Required!</title><script src="/cdn-cgi/challenge-platform/x"></script>',
  ])(
    "rejects a confirmed challenge instead of proposing its title",
    async (html) => {
      const fixture = transport(html);
      await expect(
        extractProductLink("https://shop.example/item", {
          transport: fixture.dependencies,
        }),
      ).rejects.toMatchObject({ code: "extraction_failed" });
    },
  );

  it("does not reject a legitimate product merely named Just a moment", async () => {
    const fixture = transport(
      '<title>Just a moment</title><script type="application/ld+json">{"@type":"Product","name":"Just a moment"}</script>',
    );
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Just a moment");
  });

  it("binds multi-product fields to the exact URL match instead of a recommendation or global metadata", async () => {
    const fixture =
      transport(`<meta property="og:title" content="Recommended socks"><meta property="og:image" content="/socks.jpg"><meta property="product:price:amount" content="10"><meta property="product:price:currency" content="USD">
      <script type="application/ld+json">[{"@type":"Product","url":"/socks","name":"Socks","offers":{"price":"10","priceCurrency":"USD"}},{"@type":"Product","url":"/coat?variant=blue","name":"Blue coat","image":"/blue.jpg","offers":{"price":"90","priceCurrency":"USD"}}]</script>`);
    const result = await extractProductLink(
      "https://shop.example/coat?variant=blue",
      { transport: fixture.dependencies },
    );
    expect(result).toMatchObject({
      title: "Blue coat",
      originalAmountMinor: "9000",
      candidateImageUrls: ["https://shop.example/blue.jpg"],
    });
  });

  it("accepts a unique same-origin canonical match without query context", async () => {
    const fixture = transport(
      '<link rel="canonical" href="/coat"><script type="application/ld+json">[{"@type":"Product","url":"/socks","name":"Socks"},{"@type":"Product","url":"/coat","name":"Coat"}]</script>',
    );
    const result = await extractProductLink("https://shop.example/old-coat", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Coat");
  });

  it.each([
    ["/coat", [{ url: "/socks" }, { url: "/hat" }]],
    ["/coat", [{ name: "Socks" }, { name: "Hat" }]],
    ["/coat", [{ url: "/coat" }, { url: "/coat" }]],
    ["/coat?variant=blue", [{ url: "/coat" }, { url: "/hat" }]],
  ])(
    "fails into editable entry when product identity is ambiguous: %s %j",
    async (path, products) => {
      const fixture = transport(
        `<link rel="canonical" href="/coat"><meta property="og:title" content="Generic"><script type="application/ld+json">${JSON.stringify(products.map((product) => ({ "@type": "Product", ...product })))}</script>`,
      );
      await expect(
        extractProductLink(`https://shop.example${path}`, {
          transport: fixture.dependencies,
        }),
      ).rejects.toMatchObject({ code: "extraction_failed" });
    },
  );

  it("omits price when several offers cannot be disambiguated", async () => {
    const fixture = transport(
      '<meta property="product:price:amount" content="10"><meta property="product:price:currency" content="USD"><script type="application/ld+json">{"@type":"Product","name":"Coat","offers":[{"price":"10","priceCurrency":"USD"},{"price":"90","priceCurrency":"USD"}]}</script>',
    );
    const result = await extractProductLink("https://shop.example/coat", {
      transport: fixture.dependencies,
    });
    expect(result.title).toBe("Coat");
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
  });

  it("uses the exact matched offer rather than global money or the first offer", async () => {
    const fixture = transport(
      '<meta property="product:price:amount" content="10"><meta property="product:price:currency" content="USD"><script type="application/ld+json">{"@type":"Product","name":"Coat","offers":[{"url":"/coat?variant=red","price":"10","priceCurrency":"USD"},{"url":"/coat?variant=blue","price":"90","priceCurrency":"USD"}]}</script>',
    );
    const result = await extractProductLink(
      "https://shop.example/coat?variant=blue",
      { transport: fixture.dependencies },
    );
    expect(result.originalAmountMinor).toBe("9000");
  });

  it("never lets a generic page ID override an explicitly different variant URL", async () => {
    const fixture = transport(
      '<script type="application/ld+json">{"@type":"Product","@id":"#product","url":"/coat?variant=red","name":"Red coat"}</script>',
    );
    await expect(
      extractProductLink("https://shop.example/coat?variant=blue", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("does not trust a cross-origin canonical product match", async () => {
    const fixture = transport(
      '<link rel="canonical" href="https://other.example/coat"><script type="application/ld+json">{"@type":"Product","url":"https://other.example/coat","name":"Other coat"}</script>',
    );
    await expect(
      extractProductLink("https://shop.example/coat", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });

  it("applies image URL restrictions after entity decoding", async () => {
    const fixture = transport(
      '<title>Gift</title><meta property="og:image" content="https://&#49;27.0.0.1/private.jpg">',
    );
    const result = await extractProductLink("https://shop.example/item", {
      transport: fixture.dependencies,
    });
    expect(result.candidateImageUrls).toEqual([]);
  });

  it.each([
    '<meta property="product:price:amount" content="99">',
    '<meta property="product:price:currency" content="USD">',
  ])(
    "never mixes incomplete metadata money with Amazon money: %s",
    async (metadata) => {
      const fixture = transport(
        `${metadata}<script>var preferences={"currencyInfo":{"code":"INR"}};</script><span id="productTitle">Mirror</span><span class="priceToPay"><span class="a-price-whole">1,749</span></span><span class="a-price-whole">9,999</span><span class="a-price-fraction">99</span>`,
      );
      const result = await extractProductLink(
        "https://www.amazon.in/dp/B0D7SM71WK",
        { transport: fixture.dependencies },
      );
      expect(result.originalAmountMinor).toBe("174900");
      expect(result.originalCurrency).toBe("INR");
    },
  );

  it("handles a prefix ending inside a UTF-8 character without accepting an incomplete price", async () => {
    const metadata =
      '<span id="productTitle">Mirror</span><script>var preferences={"currencyInfo":{"code":"INR"}};</script><span class="priceToPay"><span class="a-price-whole">1749</span>';
    const fixture = transport(
      `${metadata}${" ".repeat(1_048_575 - encoder.encode(metadata).length)}€</span>`,
    );
    const result = await extractProductLink(
      "https://www.amazon.in/dp/B0D7SM71WK",
      { transport: fixture.dependencies },
    );
    expect(result.title).toBe("Mirror");
    expect(result.originalAmountMinor).toBeUndefined();
  });
  it.each(["priceToPay", "apex-pricetopay-value"])(
    "extracts Amazon's explicit product fields from a bounded oversized page: %s",
    async (priceClass) => {
      const fixture =
        transport(`<html><head><title>Retailer title</title></head><body>
      <script>var preferences = {"currencyInfo":{"code":"INR"}};</script>
      <span id="productTitle">Round mirror</span>
      <img id="landingImage" src="https://images.example/small.jpg" data-old-hires="https://images.example/mirror.jpg">
      <span class="a-price ${priceClass}"><span class="a-price-whole">1,749<span class="a-price-decimal">.</span></span><span class="a-price-fraction">00</span></span>
      ${" ".repeat(1_048_576)}</body></html>`);
      const result = await extractProductLink(
        "https://www.amazon.in/dp/B0D7SM71WK",
        { transport: fixture.dependencies },
      );
      expect(result).toMatchObject({
        title: "Round mirror",
        retailer: "Amazon",
        originalAmountMinor: "174900",
        originalCurrency: "INR",
        candidateImageUrls: ["https://images.example/mirror.jpg"],
      });
      expect(fixture.connection.destroyed).toBe(true);
    },
  );

  it("does not enable Amazon markup or prefix reads for a lookalike host", async () => {
    const fixture = transport(
      `<span id="productTitle">Spoof</span>${" ".repeat(1_048_576)}`,
    );
    await expect(
      extractProductLink("https://amazon.in.attacker.example/product", {
        transport: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("does not guess an Amazon currency or use an unrelated price", async () => {
    const fixture = transport(
      `<span id="productTitle">Mirror</span><span class="a-price"><span class="a-price-whole">999</span></span>`,
    );
    const result = await extractProductLink(
      "https://www.amazon.in/dp/B0D7SM71WK",
      { transport: fixture.dependencies },
    );
    expect(result.title).toBe("Mirror");
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
  });

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
        {"@type":"Product","name":"<strong>Gift</strong>","offers":{"seller":{"name":"<em>Shop</em>"}}}
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
