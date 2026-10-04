import type { AddressInfo, Server } from "node:net";

export const WISHLIST_TEST_STAGES: readonly string[];
export function createWishlistTestControlServer(options: {
  token: string;
  host?: string;
  port?: number;
}): {
  server: Server;
  listen(): Promise<AddressInfo | string | null>;
  close(): Promise<void>;
};
