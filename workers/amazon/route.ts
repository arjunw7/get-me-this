import type { Route } from "playwright-core";
/** Routing is not re-run on automatic redirects; never let acquisition follow one. */
export async function fulfillWithoutRedirects(route: Route) {
  let response: Awaited<ReturnType<Route["fetch"]>> | undefined;
  try {
    response = await route.fetch({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: route.request().resourceType() === "document" ? 18000 : 5000,
    });
    if (response.status() >= 300 && response.status() < 400) {
      await route.abort();
      return;
    }
    await route.fulfill({ response });
  } catch {
    await route.abort().catch(() => undefined);
  } finally {
    await response?.dispose().catch(() => undefined);
  }
}
