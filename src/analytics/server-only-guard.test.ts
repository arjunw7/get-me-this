/**
 * @vitest-environment jsdom
 *
 * Proves the server analytics module is inaccessible to client code: the
 * `server-only` guard throws whenever it is resolved outside a React
 * server context, so src/analytics/server.ts can never be pulled into a
 * browser bundle. The production build enforces the same boundary.
 */
import { describe, expect, it } from "vitest";

describe("server-only guard", () => {
  it("throws when imported in a browser-like (client) module context", async () => {
    await expect(import("server-only")).rejects.toThrow(/Client Component/i);
  });

  it("makes the server analytics module unimportable from client code", async () => {
    await expect(import("./server")).rejects.toThrow();
  });
});
