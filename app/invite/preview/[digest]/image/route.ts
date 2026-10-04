import { enforceInviteLandingLimit } from "@/src/invite/landing-guard";
import { loadInvitationSharePreview } from "@/src/invite/share-preview-data";
import { INVITATION_PREVIEW_HEADERS } from "@/src/invite/share-preview-response";
import { invitationShareImage } from "@/src/invite/share-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ digest: string }> },
) {
  const { digest } = await context.params;
  const preview = (await enforceInviteLandingLimit())
    ? await loadInvitationSharePreview(digest)
    : null;
  if (!preview)
    return new Response("Preview unavailable", {
      status: 404,
      headers: INVITATION_PREVIEW_HEADERS,
    });
  return invitationShareImage(preview);
}
