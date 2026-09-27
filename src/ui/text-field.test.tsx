// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TextAreaField, TextField } from "./text-field";

describe("TextField", () => {
  it("programmatically associates the persistent label with the control", () => {
    render(<TextField id="item" label="Item name" defaultValue="" />);

    const field = screen.getByLabelText("Item name");
    expect(field).toBeEnabled();
    expect(field.tagName).toBe("INPUT");
  });

  it("announces the hint through aria-describedby", () => {
    render(
      <TextField
        id="item"
        label="Item name"
        hint="Placeholders are examples, never labels."
        defaultValue=""
      />,
    );

    expect(screen.getByLabelText("Item name")).toHaveAccessibleDescription(
      "Placeholders are examples, never labels.",
    );
  });

  it("announces the error and marks the control invalid only when present", () => {
    const { rerender } = render(
      <TextField id="price" label="Price" defaultValue="twelve" />,
    );

    expect(screen.getByLabelText("Price")).not.toHaveAttribute("aria-invalid");

    rerender(
      <TextField
        id="price"
        label="Price"
        defaultValue="twelve"
        error="Numbers only, please."
      />,
    );

    const invalid = screen.getByLabelText("Price");
    expect(invalid).toHaveAttribute("aria-invalid", "true");
    expect(invalid).toHaveAccessibleDescription("Numbers only, please.");
  });

  it("combines the hint and the error into one description", () => {
    render(
      <TextField
        id="price"
        label="Price"
        hint="Original currency stays visible."
        defaultValue="twelve"
        error="Numbers only, please."
      />,
    );

    expect(screen.getByLabelText("Price")).toHaveAccessibleDescription(
      "Original currency stays visible. Numbers only, please.",
    );
  });

  it("renders as a textbox for assistive technology", () => {
    render(<TextField id="item" label="Item name" defaultValue="" />);

    expect(
      screen.getByRole("textbox", { name: "Item name" }),
    ).toBeInTheDocument();
  });

  it("accepts typed input when enabled", async () => {
    render(<TextField id="item" label="Item name" defaultValue="" />);

    const field = screen.getByLabelText("Item name");
    await userEvent.type(field, "Mushroom ceramic lamp");
    expect(field).toHaveValue("Mushroom ceramic lamp");
  });

  it("rejects typing when disabled", async () => {
    render(
      <TextField id="currency" label="Currency" defaultValue="INR" disabled />,
    );

    const field = screen.getByLabelText("Currency");
    expect(field).toBeDisabled();
    await userEvent.type(field, "USD", { pointerEventsCheck: 0 });
    expect(field).toHaveValue("INR");
  });
});

describe("TextAreaField", () => {
  it("associates the label with a multiline textbox", () => {
    render(
      <TextAreaField
        id="note"
        label="Note for your people"
        placeholder="Anything they should know?"
        defaultValue=""
      />,
    );

    const field = screen.getByRole("textbox", { name: "Note for your people" });
    expect(field.tagName).toBe("TEXTAREA");
  });

  it("announces an error through aria-describedby", () => {
    render(
      <TextAreaField
        id="note"
        label="Note for your people"
        defaultValue="way too long"
        error="Keep it short, please."
      />,
    );

    const field = screen.getByLabelText("Note for your people");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Keep it short, please.");
  });
});
