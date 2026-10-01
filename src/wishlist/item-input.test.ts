import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prefillOriginal,
  validateCreateDraft,
  validateEditDraft,
  type CreateDraft,
  type EditDraft,
} from "./item-input";
import { currencyMinorDigits, formatMoneyMinor } from "./display";

const validDraft: CreateDraft = {
  title: "Lamp",
  sourceUrl: "",
  retailer: "",
  amount: "",
  currency: "INR",
  note: "",
  desireLevel: "would_love",
  submissionId: "00000000-0000-4000-8000-000000000003",
};
const empty = { original_amount_minor: null, original_currency: null } as const;

describe("wishlist item input", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["JPY", "9223372036854775807", "9223372036854775807"],
    ["INR", "92233720368547758.07", "9223372036854775807"],
    ["KWD", "9223372036854775.807", "9223372036854775807"],
    ["CLF", "922337203685477.5807", "9223372036854775807"],
  ] as const)(
    "round-trips %s exactly through create, prefill, and display",
    (currency, amount, minor) => {
      const result = validateCreateDraft({ ...validDraft, amount, currency });
      expect(result).toMatchObject({ ok: true });
      if (result.ok) expect(result.value.original_amount_minor).toBe(minor);
      expect(
        prefillOriginal({
          original_amount_minor: minor,
          original_currency: currency,
        }),
      ).toEqual({ mode: "supported", amount, currency });
      expect(formatMoneyMinor(minor, currency)).toBe(`${amount} ${currency}`);
    },
  );

  it("accepts zero and empty prices as the all-null pair, and rejects overflow or non-decimal syntax", () => {
    const zero = validateCreateDraft({ ...validDraft, amount: "0" });
    expect(
      zero.ok && [
        zero.value.original_amount_minor,
        zero.value.original_currency,
      ],
    ).toEqual(["0", "INR"]);
    expect(validateCreateDraft(validDraft)).toMatchObject({
      ok: true,
      value: { original_amount_minor: null, original_currency: null },
    });
    for (const amount of [
      "92233720368547758.08",
      "01",
      "-1",
      "1e3",
      "1,000",
      "$1",
      "1.234",
    ]) {
      expect(validateCreateDraft({ ...validDraft, amount })).toMatchObject({
        ok: false,
        errors: { amount: expect.any(String) },
      });
    }
  });

  it("rejects oversized decimal text before constructing a BigInt", () => {
    const bigInt = vi.spyOn(globalThis, "BigInt");
    const result = validateCreateDraft({
      ...validDraft,
      amount: "9".repeat(100_000),
    });
    expect(result).toMatchObject({
      ok: false,
      errors: { amount: expect.any(String) },
    });
    expect(bigInt).not.toHaveBeenCalled();
    bigInt.mockRestore();
  });

  it("supports the complete numeric-precision table and excludes N.A. and unknown codes", () => {
    expect(currencyMinorDigits("JPY")).toBe(0);
    expect(currencyMinorDigits("INR")).toBe(2);
    expect(currencyMinorDigits("KWD")).toBe(3);
    expect(currencyMinorDigits("CLF")).toBe(4);
    expect(currencyMinorDigits("BOV")).toBeNull();
    expect(currencyMinorDigits("ZZZ")).toBeNull();
    expect(
      validateCreateDraft({ ...validDraft, amount: "1", currency: "BOV" }),
    ).toMatchObject({ ok: false });
    expect(
      validateCreateDraft({ ...validDraft, amount: "1", currency: "ZZZ" }),
    ).toMatchObject({ ok: false });
  });

  it("retains opaque stored prices and requires explicit clear or supported replacement", () => {
    const opaque = {
      original_amount_minor: "9007199254740993",
      original_currency: "ZZZ",
    };
    expect(prefillOriginal(opaque)).toEqual({
      mode: "opaque",
      rawMinor: "9007199254740993",
      currency: "ZZZ",
    });
    const preserve = validateEditDraft(
      {
        ...validDraft,
        priceIntent: "preserve",
        amount: "bad",
        currency: "NOPE",
      },
      opaque,
    );
    expect(preserve).toMatchObject({
      ok: true,
      value: { price: { kind: "preserve", expected: opaque } },
    });
    expect(
      validateEditDraft(
        {
          ...validDraft,
          priceIntent: "replace",
          amount: "1.2",
          currency: "ZZZ",
        },
        opaque,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateEditDraft(
        { ...validDraft, priceIntent: "clear", amount: "1", currency: "INR" },
        opaque,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateEditDraft(
        { ...validDraft, priceIntent: "clear", amount: "", currency: "INR" },
        opaque,
      ),
    ).toMatchObject({ ok: true, value: { price: { kind: "clear" } } });
    expect(
      validateEditDraft(
        {
          ...validDraft,
          priceIntent: "replace",
          amount: "24.99",
          currency: "INR",
        },
        empty,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validateEditDraft(
        { ...validDraft, priceIntent: "clear", amount: "", currency: "INR" },
        empty,
      ),
    ).toMatchObject({ ok: true });
    const invalid = validateEditDraft(
      { ...validDraft, priceIntent: "bad" as EditDraft["priceIntent"] },
      opaque,
    );
    expect(invalid).toMatchObject({
      ok: false,
      errors: { priceIntent: "invalid" },
      rawDraft: { title: "Lamp" },
    });
  });

  it("normalizes optional values and validates Unicode code-point bounds and desire levels", () => {
    const normalized = validateCreateDraft({
      ...validDraft,
      title: "  Lamp  ",
      sourceUrl: " https://shop.example/item ",
      retailer: "   ",
      note: "  ",
    });
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        title: "Lamp",
        source_url: "https://shop.example/item",
        retailer: null,
        note: null,
      },
    });
    for (const blank of [
      "\u0009",
      "\u000a",
      "\u000b",
      "\u000c",
      "\u000d",
      " ",
      "\u0085",
      "\u00a0",
      "\u1680",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200a",
      "\u2028",
      "\u2029",
      "\u202f",
      "\u205f",
      "\u3000",
      "\ufeff",
    ]) {
      expect(
        validateCreateDraft({ ...validDraft, title: blank }),
      ).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    }
    expect(
      validateCreateDraft({ ...validDraft, title: "😀".repeat(200) }),
    ).toMatchObject({ ok: true });
    expect(
      validateCreateDraft({ ...validDraft, title: "😀".repeat(201) }),
    ).toMatchObject({ ok: false, errors: { title: expect.any(String) } });
    for (const desireLevel of ["really_want", "would_love", "just_an_idea"])
      expect(validateCreateDraft({ ...validDraft, desireLevel })).toMatchObject(
        { ok: true },
      );
  });

  it("normalizes retailer and note using the same complete blank-code-point predicate", () => {
    const blankCodePoints = [
      "\u0009",
      "\u000a",
      "\u000b",
      "\u000c",
      "\u000d",
      " ",
      "\u0085",
      "\u00a0",
      "\u1680",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200a",
      "\u2028",
      "\u2029",
      "\u202f",
      "\u205f",
      "\u3000",
      "\ufeff",
    ];
    for (const blank of blankCodePoints) {
      const result = validateCreateDraft({
        ...validDraft,
        retailer: blank,
        note: blank,
      });
      expect(result).toMatchObject({
        ok: true,
        value: { retailer: null, note: null },
      });
    }
  });

  it("accepts only safe public HTTP(S) URLs and never fetches them", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const sourceUrl of [
      "https://public.example/item",
      "http://public.example/item",
    ])
      expect(validateCreateDraft({ ...validDraft, sourceUrl })).toMatchObject({
        ok: true,
      });
    for (const sourceUrl of [
      "ftp://public.example",
      "https://user:pass@public.example",
      "https://public.example:444",
      "https://localhost/item",
      "http://127.1/item",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://192.168.1.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "https://public.example/\nitem",
      "not a url",
    ]) {
      expect(validateCreateDraft({ ...validDraft, sourceUrl })).toMatchObject({
        ok: false,
        errors: { sourceUrl: expect.any(String) },
        rawDraft: { sourceUrl },
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
