import { describe, expect, it } from "vitest";

import { ExtractionError } from "./errors";
import { parseDestinationUrl } from "./url-policy";

function codeFor(value: string): string | null {
  try {
    parseDestinationUrl(value);
    return null;
  } catch (error) {
    return error instanceof ExtractionError ? error.code : "unknown";
  }
}

describe("destination URL policy", () => {
  it.each([
    ["http://example.com/item?q=1", "http://example.com/item?q=1"],
    ["http://example.com:80/item", "http://example.com/item"],
    ["https://example.com:443/item", "https://example.com/item"],
    ["https://8.8.8.8/item", "https://8.8.8.8/item"],
    [
      "https://[2606:4700:4700::1111]/item",
      "https://[2606:4700:4700::1111]/item",
    ],
  ])("admits and normalizes %s", (input, expected) => {
    expect(parseDestinationUrl(input).href).toBe(expected);
  });

  it.each([
    "ftp://example.com/item",
    "https://example.com:444/item",
    "http://example.com:443/item",
    "https://user:password@example.com/item",
    "https://example.com/item#fragment",
    "https://localhost/item",
    "https://singlelabel/item",
    "https://-bad.example/item",
    "https://127.0.0.1/item",
    "https://[::1]/item",
    "https://[fe80::1%25en0]/item",
    "https://1.2/item",
    "https://0x08080808/item",
    "https://010.010.010.010/item",
    "https://8.8.8.8\\@evil.example/item",
    " https://example.com/item",
    "not a url",
    "",
  ])("rejects %s", (input) => {
    expect(codeFor(input)).not.toBeNull();
  });

  it("rejects overlong input", () => {
    expect(codeFor(`https://example.com/${"a".repeat(2_100)}`)).toBe(
      "invalid_url",
    );
  });
});
