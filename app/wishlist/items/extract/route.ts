import { handleExtractionPostWithAnalytics } from "@/src/wishlist/extraction/analytics-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // 005f: the emission-only wrapper around the unchanged 005e boundary.
  // All admission, transport, and security behavior is still owned by
  // handleExtractionPost; this wrapper adds product_extraction_completed
  // telemetry (denials emit nothing) and never alters the response.
  return await handleExtractionPostWithAnalytics(request);
}
