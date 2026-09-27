import { cx } from "@/src/ui/styles";

/**
 * Initials avatar, ported from the frozen V18 reference
 * (components/Avatar.tsx). Accent fills map to semantic tokens; only the
 * sizes needed by the public screens are carried for now.
 */
export type AvatarSize = "xs" | "sm";

export type AvatarAccent = "coral" | "electric" | "lime" | "marigold" | "ink";

export type AvatarPerson = {
  readonly name: string;
  readonly initials: string;
  readonly accent: AvatarAccent;
  readonly status: "joined" | "pending";
};

const SIZES: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-caption",
  sm: "h-9 w-9 text-xs",
};

const ACCENT_FILL: Record<AvatarAccent, string> = {
  coral: "bg-action-primary text-content-primary",
  marigold: "bg-accent-highlight text-content-primary",
  electric: "bg-accent-info text-surface-raised",
  lime: "bg-accent-fresh text-content-primary",
  ink: "bg-outline-strong text-surface-page",
};

export function Avatar({
  person,
  size = "sm",
  className = "",
}: {
  person: AvatarPerson;
  size?: AvatarSize;
  className?: string;
}) {
  const pending = person.status === "pending";
  const fill = pending
    ? "bg-surface-page text-content-muted border-2 border-dashed border-outline-strong/40"
    : cx(ACCENT_FILL[person.accent], "border-2 border-outline-strong");
  return (
    <span
      role="img"
      aria-label={pending ? `${person.name} (invited)` : person.name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold select-none",
        SIZES[size],
        fill,
        className,
      )}
    >
      {person.initials}
    </span>
  );
}
