import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";

import {
  controlClassName,
  fieldErrorClassName,
  fieldHintClassName,
  fieldLabelClassName,
} from "./styles";

type SharedFieldProps = {
  id: string;
  /** Persistent label. Placeholders are examples, never labels. */
  label: string;
  hint?: string;
  /** Present value marks the control invalid and is announced with it. */
  error?: string;
};

type ExcludedProps =
  | "className"
  | "style"
  | "dangerouslySetInnerHTML"
  | "id"
  | "aria-invalid"
  | "aria-describedby";

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  ExcludedProps
>;

type NativeTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  ExcludedProps
>;

export type TextFieldProps = SharedFieldProps &
  NativeInputProps & {
    ref?: Ref<HTMLInputElement>;
  };

export type TextAreaFieldProps = SharedFieldProps &
  NativeTextareaProps & {
    ref?: Ref<HTMLTextAreaElement>;
  };

function describedBy(ids: ReadonlyArray<string | undefined>) {
  const present = ids.filter((id): id is string => Boolean(id));
  return present.length > 0 ? present.join(" ") : undefined;
}

export function TextField({
  id,
  label,
  hint,
  error,
  ref,
  ...nativeProps
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabelClassName}>
        {label}
      </label>
      <input
        {...nativeProps}
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy([hintId, errorId])}
        className={controlClassName({
          invalid: Boolean(error),
          multiline: false,
        })}
      />
      {hint ? (
        <p id={hintId} className={fieldHintClassName}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={fieldErrorClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  ref,
  ...nativeProps
}: TextAreaFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabelClassName}>
        {label}
      </label>
      <textarea
        {...nativeProps}
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy([hintId, errorId])}
        className={controlClassName({
          invalid: Boolean(error),
          multiline: true,
        })}
      />
      {hint ? (
        <p id={hintId} className={fieldHintClassName}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={fieldErrorClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
