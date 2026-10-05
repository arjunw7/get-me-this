import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  productResponseHeaders,
} = require("../../dist/amazon/workers/amazon/product-route.js");
const {
  readProductDom,
} = require("../../dist/amazon/src/wishlist/extraction/product-browser-dom.js");
const {
  createProductRequestPolicy,
} = require("../../dist/amazon/src/wishlist/extraction/product-browser-protocol.js");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    env: {
      PATH: process.env.PATH,
      HOME: "/tmp",
      PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
    },
    timeout: 20000,
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    let blocked = 0;
    let blockedNavigation = false;
    const target = new URL("https://fixture.example/products/cup");
    const policy = createProductRequestPolicy(target);
    policy.navigate(target);
    await page.route("**/*", async (route) => {
      if (
        policy.admit(
          route.request().url(),
          route.request().method(),
          route.request().resourceType(),
          route.request().frame() === page.mainFrame(),
        ) &&
        route.request().url() === "https://fixture.example/products/cup"
      )
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          headers: productResponseHeaders({
            "content-security-policy": "worker-src * blob:",
          }),
          body: `<h1>Blue cup</h1><p>INR 123.45</p><script type="application/ld+json">{"@type":"Product","name":"Blue cup","image":"https://cdn.example/cup.jpg","offers":{"@type":"Offer","price":"123.45","priceCurrency":"INR"}}</script>`,
        });
      else {
        blocked++;
        if (route.request().url() === "https://fixture.example/wrong-product")
          blockedNavigation = true;
        await route.abort();
      }
    });
    await page.goto("https://fixture.example/products/cup", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    const workers = await page.evaluate(async () => {
      async function probe(raw, shared = false) {
        return await new Promise((resolve) => {
          let worker;
          const timer = setTimeout(() => {
            worker?.terminate?.();
            worker?.port?.close();
            resolve("timeout");
          }, 2000);
          try {
            worker = shared ? new SharedWorker(raw) : new Worker(raw);
            worker.onerror = () => {
              clearTimeout(timer);
              worker.terminate?.();
              worker.port?.close();
              resolve(true);
            };
            worker.onmessage = () => {
              clearTimeout(timer);
              worker.terminate?.();
              resolve(false);
            };
          } catch {
            clearTimeout(timer);
            resolve(true);
          }
        });
      }
      return [
        await probe("https://fixture.example/worker.js"),
        await probe(
          URL.createObjectURL(
            new Blob(['postMessage("unexpected")'], {
              type: "text/javascript",
            }),
          ),
        ),
        await probe(
          URL.createObjectURL(
            new Blob(['onconnect=e=>e.ports[0].postMessage("unexpected")'], {
              type: "text/javascript",
            }),
          ),
          true,
        ),
      ];
    });
    const metadata = await page.evaluate(readProductDom);
    await page.evaluate(() => {
      setTimeout(
        () => location.assign("https://fixture.example/wrong-product"),
        0,
      );
    });
    await page.waitForTimeout(200);
    if (
      !workers.every((value) => value === true) ||
      metadata.title !== "Blue cup" ||
      !blockedNavigation
    )
      throw Error("runtime security check failed");
    console.log(
      JSON.stringify({
        sandbox: true,
        networkAndBlobWorkersBlocked: workers,
        domTitle: metadata.title,
        domPrice: metadata.price,
        blockedAutomaticNavigations: blocked,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.name);
  process.exitCode = 1;
});
