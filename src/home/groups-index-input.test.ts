import { describe, expect, it } from "vitest";
import { inviteDestination } from "./groups-index-input";

const TOKEN = "A".repeat(43);
const ORIGIN = "https://getmethis.test";

describe("group invite entry", () => {
  it("opens only the canonical invitation route on this site", () => {
    expect(inviteDestination(` ${ORIGIN}/invite/${TOKEN} `, ORIGIN)).toBe(
      `/invite/${TOKEN}`,
    );
    expect(inviteDestination(`/invite/${TOKEN}`, ORIGIN)).toBe(
      `/invite/${TOKEN}`,
    );
  });
  it.each([
    "",
    "javascript:alert(1)",
    `https://attacker.test/invite/${TOKEN}`,
    `//attacker.test/invite/${TOKEN}`,
    `https://getmethis.test.attacker.test/invite/${TOKEN}`,
    `https://user:password@getmethis.test/invite/${TOKEN}`,
    `/invite/${TOKEN}?next=https://attacker.test`,
    `/invite/${TOKEN}#secret`,
    "/invite/diwali-scenes",
    `/invite/${"B".repeat(43)}`,
    `/groups/${TOKEN}`,
    `/invite/${TOKEN}/extra`,
    `\\attacker.test/invite/${TOKEN}`,
  ])("rejects malformed or foreign input %# without opening it", (value) => {
    expect(inviteDestination(value, ORIGIN)).toBeNull();
  });
});
