import type { Route } from "playwright-core";
import { productResourceAllowed } from "../../src/wishlist/extraction/product-browser-protocol";
export function productResponseHeaders(headers: Record<string, string>) {
  const restriction = "worker-src 'none'; frame-src 'none'; object-src 'none'";
  return {
    ...headers,
    "content-security-policy": headers["content-security-policy"]
      ? `${headers["content-security-policy"]}, ${restriction}`
      : restriction,
  };
}
/** Inspect each redirect before a browser request can follow it. */
export async function fulfillProductResource(
  route: Route,
  onDocumentRedirect?: (url: string) => void,
) {
  let response: Awaited<ReturnType<Route["fetch"]>> | undefined;
  try {
    response = await route.fetch({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: route.request().resourceType() === "document" ? 15000 : 5000,
    });
    if (response.status() >= 300 && response.status() < 400) {
      const location = response.headers().location;
      const destination = location
        ? new URL(location, route.request().url()).href
        : null;
      if (
        !onDocumentRedirect ||
        !destination ||
        !productResourceAllowed(destination)
      ) {
        await route.abort();
        return;
      }
      onDocumentRedirect(destination);
      await route.fulfill({ status: 200, contentType: "text/html", body: "" });
      return;
    }
    // Pinning is enforced by the proxy; never permit Chromium to refetch.
    const headers =
      route.request().resourceType() === "document"
        ? productResponseHeaders(response.headers())
        : response.headers();
    await route.fulfill({ response, headers });
  } catch {
    await route.abort().catch(() => undefined);
  } finally {
    await response?.dispose().catch(() => undefined);
  }
}
