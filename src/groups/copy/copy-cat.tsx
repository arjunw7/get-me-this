import Image from "next/image";

/** Marks this card as a copied item, without revealing its source. */
export function CopyCatSticker() {
  return (
    <div
      data-testid="copy-cat"
      data-copy-cat
      role="img"
      aria-label="Copy Cat — copied item"
      className="pointer-events-none absolute -top-3 -right-3 z-10 flex h-21 w-25 -rotate-[25deg] items-center justify-center text-content-primary"
    >
      <Image
        src="/stickers/copy-cat-face-bold.png"
        alt=""
        aria-hidden="true"
        width={100}
        height={84}
        className="h-21 w-25 shrink-0 object-contain"
      />
      <span className="sr-only">Copy Cat</span>
    </div>
  );
}
