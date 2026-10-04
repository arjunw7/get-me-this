#!/usr/bin/env node
// Run after compiling the worker: node workers/amazon/redirect-check.mjs
// Controlled loopback fixtures only; no credentials or retailer traffic.
import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright-core";
import { fulfillWithoutRedirects } from "../../dist/amazon/workers/amazon/route.js";

async function main() {
  const hits = new Map();
  const fixture = http.createServer((req, res) => {
    hits.set(req.url, (hits.get(req.url) || 0) + 1);
    if (req.url === "/selected-redirect") {
      res.writeHead(302, { location: "/wrong-product" });
      res.end();
    } else if (req.url === "/image-redirect") {
      res.writeHead(302, { location: "/wrong-image" });
      res.end();
    } else if (req.url === "/selected-ok") {
      res.setHeader("content-type", "text/html");
      res.end(
        '<h1 id="product">Selected product</h1><img src="/image-redirect">',
      );
    } else {
      res.end("Unexpected redirected resource");
    }
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      timeout: 5000,
    });
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    await context.route("**/*", fulfillWithoutRedirects);
    const page = await context.newPage();
    await assert.rejects(
      page.goto(origin + "/selected-redirect", {
        timeout: 5000,
        waitUntil: "domcontentloaded",
      }),
    );
    assert.equal(hits.get("/selected-redirect"), 1);
    assert.equal(hits.get("/wrong-product") || 0, 0);
    await page.close();
    const successfulPage = await context.newPage();
    await successfulPage.goto(origin + "/selected-ok", {
      timeout: 5000,
      waitUntil: "load",
    });
    assert.equal(
      await successfulPage.locator("#product").textContent(),
      "Selected product",
    );
    assert.equal(hits.get("/image-redirect"), 1);
    assert.equal(hits.get("/wrong-image") || 0, 0);
    console.log(
      "PASS: document and image redirects never fetch their destinations; 200 document is preserved.",
    );
  } finally {
    await browser?.close();
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
  }
}
main().catch((error) => {
  console.error(error.name + ": " + error.message);
  process.exitCode = 1;
});
