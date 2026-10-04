import { describe, expect, it } from "vitest";
import { groupCreationPrefill } from "./creation-prefill";

describe("group creation URL hints", () => {
  it("preserves a chosen occasion and normalizes the suggested name", () => {
    expect(
      groupCreationPrefill({ name: "  Diwali\n night  ", occasion: "diwali" }),
    ).toEqual({ initialName: "Diwali night", initialOccasion: "diwali" });
  });
  it("rejects duplicate, unknown and overlong hints without changing defaults", () => {
    expect(
      groupCreationPrefill({ name: ["one", "two"], occasion: "administrator" }),
    ).toEqual({ initialName: "", initialOccasion: "birthday" });
    expect(
      groupCreationPrefill({ name: "x".repeat(81), occasion: ["diwali"] }),
    ).toEqual({ initialName: "", initialOccasion: "birthday" });
  });
});
