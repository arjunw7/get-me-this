import { describe, expect, it } from "vitest";

import {
  buttonSamples,
  colorSwatches,
  surfaceSamples,
  typeSamples,
} from "./design-fixture";

describe("design fixture", () => {
  it("uses unique identifiers so rendering order is stable", () => {
    const ids = [
      ...typeSamples.map((sample) => sample.id),
      ...colorSwatches.map((swatch) => swatch.id),
      ...buttonSamples.map((sample) => sample.id),
      ...surfaceSamples.map((sample) => sample.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shows both enabled and disabled buttons", () => {
    expect(buttonSamples.some((sample) => sample.disabled)).toBe(true);
    expect(buttonSamples.some((sample) => !sample.disabled)).toBe(true);
  });

  it("covers every button variant", () => {
    const variants = new Set(buttonSamples.map((sample) => sample.variant));
    expect(variants).toEqual(new Set(["primary", "secondary", "subtle"]));
  });

  it("covers every surface tone", () => {
    const tones = new Set(surfaceSamples.map((sample) => sample.tone));
    expect(tones).toEqual(new Set(["raised", "sunken", "accent"]));
  });

  it("uses approved product terminology", () => {
    const copy = buttonSamples.map((sample) => sample.label).join(" ");
    expect(copy).not.toMatch(/shelfie|circle/i);
  });
});
