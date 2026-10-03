// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateField } from "./date-field";

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
function Fixture({
  min,
  max,
  initial = "2028-02-28",
}: {
  min?: string;
  max?: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField
        id="date"
        name="date"
        label="Date"
        value={value}
        onChange={setValue}
        min={min}
        max={max}
      />
      <button>Outside</button>
    </>
  );
}
describe("DateField", () => {
  it("preserves typed dates for strict form validation and offers canonical calendar selection", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole("textbox", { name: "Date" });
    await user.clear(input);
    await user.type(input, "2028-02-30");
    expect(input).toHaveValue("2028-02-30");
    await user.clear(input);
    await user.type(input, "2028-02-28");
    await user.click(screen.getByRole("button", { name: "Choose date" }));
    expect(screen.getByRole("dialog", { name: "Choose date" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "February 28, 2028" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(input).toHaveValue("2028-02-29");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose date" })).toHaveFocus();
  });
  it("moves across months with keyboard, clamps month lengths and cancels without changing value", async () => {
    const user = userEvent.setup();
    render(<Fixture initial="2027-01-31" />);
    await user.click(screen.getByRole("button", { name: "Choose date" }));
    await user.keyboard("{PageDown}");
    expect(
      screen.getByRole("button", { name: "February 28, 2027" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "March 2027" })).toBeVisible();
    expect(screen.getByRole("button", { name: "March 1, 2027" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Date")).toHaveValue("2027-01-31");
    expect(screen.getByRole("button", { name: "Choose date" })).toHaveFocus();
  });
  it("honors optional date bounds and does not steal focus after outside dismissal", async () => {
    const user = userEvent.setup();
    render(<Fixture min="2028-02-28" max="2028-03-03" />);
    await user.click(screen.getByRole("button", { name: "Choose date" }));
    expect(
      screen.getByRole("button", { name: "February 27, 2028" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previous month" }),
    ).toBeDisabled();
    await user.keyboard("{ArrowLeft}");
    expect(
      screen.getByRole("button", { name: "February 28, 2028" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("button", { name: "March 3, 2028" })).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "March 4, 2028" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
    expect(screen.getByLabelText("Date")).toHaveValue("2028-02-28");
  });
  it("opens from the keyboard and selects the local Today value", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    screen.getByLabelText("Date").focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByLabelText("Date")).toHaveValue(expected);
  });
});
