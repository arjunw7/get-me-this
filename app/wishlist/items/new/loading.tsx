import { AddItemHeader } from "@/src/wishlist/add-item-header";

/** Keep the standalone Add Item shell while its protected route loads. */
export default function AddItemLoading() {
  return (
    <div className="min-h-screen bg-surface-page text-content-primary">
      <AddItemHeader />
      <main className="mx-auto max-w-[var(--spacing-content-max)] px-5 pt-8 sm:pt-12">
        <div aria-hidden="true" className="space-y-6 animate-pulse">
          <div className="h-20 rounded-surface bg-surface-sunken" />
          <div className="h-14 rounded-surface bg-surface-sunken" />
        </div>
        <p role="status" className="sr-only">
          Loading Add Item.
        </p>
      </main>
    </div>
  );
}
