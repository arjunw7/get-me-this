"use client";

import { Component, type ReactNode } from "react";
import { isRedirectError } from "next/dist/client/components/redirect-error";

type Props = { itemId: string; children: ReactNode };
type State = { failed: boolean };

export class DeleteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: unknown): State | null {
    if (isRedirectError(error)) throw error;
    return { failed: true };
  }

  componentDidCatch() {
    // Provider details and user-entered item data are intentionally omitted.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="mt-6 rounded-surface border-2 border-outline-strong bg-surface-raised p-4">
      <p>We couldn’t confirm the delete request. Check the item from a fresh page load.</p>
      <a className="mt-3 inline-flex min-h-touch-min items-center font-bold underline" href={`/wishlist/items/${this.props.itemId}/edit`}>Check item status</a>
    </section>;
  }
}
