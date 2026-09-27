import type { ButtonHTMLAttributes, Ref } from "react";

import { buttonClassName, type ButtonSize, type ButtonVariant } from "./styles";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "style" | "dangerouslySetInnerHTML"
>;

export type ButtonProps = NativeButtonProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Native button semantics are preserved: the disabled attribute is passed
 * through so the control is removed from the tab order and cannot be activated.
 */
export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  ref,
  ...nativeProps
}: ButtonProps) {
  return (
    <button
      {...nativeProps}
      ref={ref}
      type={type}
      disabled={disabled}
      className={buttonClassName({ variant, size })}
    />
  );
}
