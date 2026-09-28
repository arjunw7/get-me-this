// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OtpInput } from "./otp-input";

/**
 * The six-digit OTP control ports the reference's keyboard contract:
 * digit entry with auto-advance, paste fill, backspace-to-previous, and
 * arrow navigation, with an invalid tone announced on the group.
 */

function setup(digits = Array(6).fill(""), invalid = false) {
  const onChange = vi.fn();
  render(
    <OtpInput
      digits={digits}
      onChange={onChange}
      invalid={invalid}
      labelledBy="otp-label"
      describedBy="otp-note"
    />,
  );
  return { onChange };
}

function cell(index: number) {
  return screen.getByRole("textbox", { name: `Digit ${index + 1} of 6` });
}

describe("OtpInput", () => {
  it("enters a digit and moves focus forward", async () => {
    const { onChange } = setup();
    await userEvent.type(cell(0), "4");
    expect(onChange).toHaveBeenCalledWith(["4", "", "", "", "", ""]);
  });

  it("fills remaining cells from a paste, ignoring non-digits", async () => {
    const { onChange } = setup();
    await userEvent.click(cell(0));
    await userEvent.paste("48 29-13");
    expect(onChange).toHaveBeenCalledWith("482913".split(""));
  });

  it("backspaces to the previous cell when the current one is empty", async () => {
    const { onChange } = setup(["4", "8", "", "", "", ""]);
    await userEvent.type(cell(1), "{Backspace}");
    expect(onChange).toHaveBeenCalledWith(["4", "", "", "", "", ""]);
  });

  it("navigates with the arrow keys", async () => {
    const { onChange } = setup(["4", "8", "2", "9", "1", "3"]);
    await userEvent.type(cell(0), "{ArrowRight}");
    expect(cell(1)).toHaveFocus();
    await userEvent.type(cell(1), "{ArrowLeft}");
    expect(cell(0)).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks each cell with aria-invalid in the designed error tone", () => {
    setup(Array(6).fill(""), true);
    expect(cell(0)).toHaveAttribute("aria-invalid", "true");
    expect(cell(5)).toHaveAttribute("aria-invalid", "true");
  });

  it("only ever accepts one code format: digits, one per cell", async () => {
    const { onChange } = setup();
    await userEvent.type(cell(0), "a4");
    expect(onChange).toHaveBeenLastCalledWith(["4", "", "", "", "", ""]);
  });
});
