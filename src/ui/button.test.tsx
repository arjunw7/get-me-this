// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("uses native button semantics", () => {
    render(<Button>Start my wishlist</Button>);

    expect(
      screen.getByRole("button", { name: "Start my wishlist" }),
    ).toHaveProperty("type", "button");
  });

  it("activates through a click when enabled", async () => {
    const onActivate = vi.fn();
    render(<Button onClick={onActivate}>Add an item</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Add an item" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("carries the native disabled attribute when disabled", () => {
    render(<Button disabled>Create a group</Button>);

    expect(
      screen.getByRole("button", { name: "Create a group" }),
    ).toBeDisabled();
  });

  it("cannot be activated when disabled", async () => {
    const onActivate = vi.fn();
    render(
      <Button disabled onClick={onActivate}>
        Update my wishlist
      </Button>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Update my wishlist" }),
      { pointerEventsCheck: 0 },
    );
    expect(onActivate).not.toHaveBeenCalled();
  });
});
