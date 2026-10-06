import Image from "next/image";

/** The sticker is a confirmation, never another copy action. */
export function CopyCatSticker() {
  return (
    <div
      data-testid="copy-cat"
      data-copy-cat
      role="img"
      aria-label="Copy Cat — copied to your wishlist"
      className="pointer-events-none absolute -top-3 -right-3 z-10 flex h-18 w-21 -rotate-[25deg] items-center justify-center text-content-primary"
    >
      <Image
        src="/stickers/copy-cat-face-bold.png"
        alt=""
        aria-hidden="true"
        width={84}
        height={72}
        className="h-18 w-21 shrink-0 object-contain"
      />
      <span className="sr-only">Copy Cat</span>
    </div>
  );
}
