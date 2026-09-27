import { Avatar, type AvatarPerson } from "./avatar";

/**
 * Overlapping avatar stack, ported from the frozen V18 reference
 * (components/AvatarStack.tsx).
 */
export function AvatarStack({
  people,
  max = 5,
  size = "sm",
}: {
  people: readonly AvatarPerson[];
  max?: number;
  size?: "xs" | "sm";
}) {
  const visible = people.slice(0, max);
  const extra = people.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((person, index) => (
        <Avatar
          key={person.name}
          person={person}
          size={size}
          className={`${index > 0 ? "-ml-2.5 " : ""}ring-2 ring-surface-raised`}
        />
      ))}
      {extra > 0 && (
        <span className="-ml-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-sunken text-xs font-bold ring-2 ring-surface-raised">
          +{extra}
        </span>
      )}
    </div>
  );
}
