import type { Vibe } from "@/src/profile/vibe";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import { AppNavigation } from "@/src/home/app-navigation";

/** Shared navigation preserves the existing invitation-aware logout path. */
export async function WishlistShellHeader({
  email,
  displayName,
  tasteLine,
  vibe,
  showMobileAdd,
}: {
  email: string | null;
  displayName: string;
  tasteLine?: string | null;
  vibe?: Vibe;
  showMobileAdd?: boolean;
}) {
  const coordinator = await readCoordinatorCookie();
  return (
    <AppNavigation
      email={email}
      displayName={displayName}
      tasteLine={tasteLine}
      vibe={vibe}
      showMobileAdd={showMobileAdd}
      brokered={coordinator !== null}
    />
  );
}
