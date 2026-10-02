// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReserveAction } from "./reserve-action";

describe("ReserveAction", () => {
  it("renders the reserve action on an unreserved eligible item", async () => {
    const onReserve = vi.fn().mockResolvedValue("reserved");
    render(
      <ReserveAction
        viewerState="unreserved"
        onReserve={onReserve}
        onRelease={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Reserve gift" });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    await waitFor(() => expect(onReserve).toHaveBeenCalledOnce());
  });

  it("shows friendly conflict feedback when the claim loses the race", async () => {
    const onReserve = vi.fn().mockResolvedValue("conflict");
    render(
      <ReserveAction
        viewerState="unreserved"
        onReserve={onReserve}
        onRelease={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reserve gift" }));
    await waitFor(() =>
      expect(screen.getByText("Someone beat you to it")).toBeInTheDocument(),
    );
  });

  it("shows reserved-by-you with a confirmed release", async () => {
    const onRelease = vi.fn().mockResolvedValue("released");
    render(
      <ReserveAction
        viewerState="yours"
        onReserve={vi.fn()}
        onRelease={onRelease}
      />,
    );

    expect(screen.getByText("Reserved by you")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Release reservation" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await waitFor(() => expect(onRelease).toHaveBeenCalledOnce());
  });

  it("keeps the reservation when release confirmation is declined", async () => {
    const onRelease = vi.fn();
    render(
      <ReserveAction
        viewerState="yours"
        onReserve={vi.fn()}
        onRelease={onRelease}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Release reservation" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByText("Reserved by you")).toBeInTheDocument();
  });

  it("shows the identity-free reserved chip for another member's reservation", () => {
    render(
      <ReserveAction
        viewerState="other"
        onReserve={vi.fn()}
        onRelease={vi.fn()}
      />,
    );

    expect(screen.getByText("Reserved")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows failure feedback and keeps the prior state on an error", async () => {
    const onReserve = vi.fn().mockResolvedValue("error");
    render(
      <ReserveAction
        viewerState="unreserved"
        onReserve={onReserve}
        onRelease={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reserve gift" }));
    await waitFor(() =>
      expect(
        screen.getByText("That didn’t go through. Try again."),
      ).toBeInTheDocument(),
    );
  });
});
