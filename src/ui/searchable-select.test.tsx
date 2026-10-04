// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./searchable-select";

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
const options = [
  { value: "INR", label: "INR", description: "Indian Rupee" },
  { value: "USD", label: "USD", description: "US Dollar" },
  { value: "EUR", label: "EUR", description: "Euro" },
];
function Fixture({
  disabled = false,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState("INR");
  return (
    <form
      aria-label="Prices"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <SearchableSelect
        id="currency"
        name="currency"
        label="Currency"
        value={value}
        onChange={setValue}
        options={options}
        disabled={disabled}
      />
      <button type="button">Outside</button>
      <button type="submit">Save item</button>
    </form>
  );
}

describe("SearchableSelect", () => {
  it("uses closed-selector Enter to open choices without implicitly submitting a valid form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Fixture onSubmit={onSubmit} />);
    await user.tab();
    const input = screen.getByRole("combobox", { name: "Currency" });
    expect(input).toHaveValue("INR");
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("INR");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save item" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it("searches full names and submits only the explicitly selected supported value", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole("combobox", { name: "Currency" });
    await user.click(input);
    await user.type(input, "dollar");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).get("currency"),
    ).toBe("INR");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("USD");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).get("currency"),
    ).toBe("USD");
  });
  it("supports arrow selection, Escape cancellation and outside dismissal", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole("combobox", { name: "Currency" });
    input.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(input).toHaveValue("USD");
    await user.click(input);
    await user.type(input, "no-match");
    expect(screen.getByRole("status")).toHaveTextContent("No matches");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("USD");
    expect(input).toHaveFocus();
    await user.click(input);
    await user.type(input, "eur");
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(input).toHaveValue("USD");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });

  it("replaces the selected label when a keyboard user types after tabbing in", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    await user.tab();
    await user.keyboard("USD{Enter}");
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "USD",
    );
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).get("currency"),
    ).toBe("USD");
  });
  it("selects a styled pointer option and preserves normal Tab navigation", async () => {
    const user = userEvent.setup();
    render(<Fixture />);
    const input = screen.getByRole("combobox", { name: "Currency" });
    await user.click(screen.getByRole("button", { name: "Choose currency" }));
    await user.click(screen.getByRole("option", { name: "EUR Euro" }));
    expect(input).toHaveValue("EUR");
    await user.click(input);
    await user.tab();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("cannot open or submit a disabled currency control", async () => {
    const user = userEvent.setup();
    render(<Fixture disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Choose currency" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(
      new FormData(screen.getByRole("form") as HTMLFormElement).has("currency"),
    ).toBe(false);
  });
});
