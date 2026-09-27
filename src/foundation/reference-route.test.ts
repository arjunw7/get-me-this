import { describe, expect, it } from "vitest";

import { referenceRoute } from "./reference-route";

describe("foundation reference route", () => {
  it("defines stable, non-empty route content", () => {
    expect(referenceRoute.eyebrow).toBe("Foundation reference");
    expect(referenceRoute.title).toBe(
      "Get Me This is ready for the next slice.",
    );
    expect(referenceRoute.description).toContain("deterministic");
    expect(referenceRoute.guarantees).toHaveLength(3);
    expect(referenceRoute.guarantees.every(Boolean)).toBe(true);
  });
});
