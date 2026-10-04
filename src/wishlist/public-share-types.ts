import type { Vibe } from "@/src/profile/vibe";
import type { MemberWishlistItem } from "@/src/groups/member-wishlist-data";
import type { ReactionSummaryRow } from "@/src/groups/reactions/types";

export type OwnShareState = {
  enabled: boolean;
  version: string;
  shareToken: string | null;
};

export type ShareWishlistChange = (
  expectedVersion: string,
  enabled: boolean,
) => Promise<{ status: "saved"; state: OwnShareState } | { status: "error" }>;

export type PublicWishlistView = {
  displayName: string;
  tasteLine: string | null;
  vibe: Vibe;
  viewerIsOwner: boolean;
  items: readonly (MemberWishlistItem & { reaction: ReactionSummaryRow })[];
};
