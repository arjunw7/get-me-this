import { handleExtractionPost } from "@/src/wishlist/extraction/request-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return await handleExtractionPost(request);
}
