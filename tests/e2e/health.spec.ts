import { expect, test } from "@playwright/test";

/**
 * The /health liveness contract, asserted against the production build.
 * The same exact assertions run under both approved projects; the response
 * must not vary with viewport because it is not rendered content.
 */

test("/health returns the liveness response", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/json");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toStrictEqual({ status: "ok" });
});
