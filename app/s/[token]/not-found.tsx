import Link from "next/link";
export default function SharedWishlistNotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <h1 className="font-display text-3xl font-extrabold">
        This wishlist isn’t available.
      </h1>
      <p className="mt-4 text-content-secondary">
        The link may have changed, or its owner may have stopped sharing. Ask
        them for a new link.
      </p>
      <Link href="/" className="mt-6 inline-block font-bold underline">
        Go to Get Me This
      </Link>
    </main>
  );
}
