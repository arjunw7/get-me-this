// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readProductDom } from "./product-browser-dom";
afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});
function setup(products: unknown) {
  document.body.innerHTML = "<h1>Blue cup</h1><p>INR 123.45</p>";
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(products);
  document.head.append(script);
}
const product = {
  "@type": "Product",
  name: "Blue cup",
  image: "/cup.jpg",
  offers: { "@type": "Offer", price: "123.45", priceCurrency: "INR" },
};
describe("bounded rendered product reader", () => {
  it("selects the product matching the heading rather than a recommendation", () => {
    setup([
      { "@type": "Product", name: "Other cup", image: "/wrong.jpg" },
      product,
    ]);
    expect(readProductDom()).toMatchObject({
      title: "Blue cup",
      images: ["/cup.jpg"],
      price: "123.45",
      currency: "INR",
    });
  });
  it.each([
    {
      ...product,
      offers: [product.offers, { ...product.offers, price: "999" }],
    },
    {
      ...product,
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "1",
        price: "1",
        priceCurrency: "INR",
      },
    },
    {
      ...product,
      offers: {
        ...product.offers,
        availability: "https://schema.org/OutOfStock",
      },
    },
  ])(
    "leaves ambiguous ranges, variants and unavailable offers empty",
    (value) => {
      setup(value);
      expect(readProductDom().price).toBeNull();
    },
  );
  it("detects challenge pages", () => {
    document.body.innerHTML = "<h1>Verify you are human</h1>";
    expect(readProductDom().blocked).toBe(true);
  });
  it("reads rendered metadata when JSON-LD is missing", () => {
    document.head.innerHTML =
      '<meta property="og:title" content="Blue cup"><meta property="og:image" content="/cup.jpg">';
    expect(readProductDom()).toMatchObject({
      title: "Blue cup",
      images: ["/cup.jpg"],
      price: null,
      currency: null,
    });
  });
});
