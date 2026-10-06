// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReserveAction } from "./reserve-action";

function mount(
  viewerState: "unreserved" | "yours" | "other",
  onReserve = vi.fn().mockResolvedValue("reserved"),
  onRelease = vi.fn().mockResolvedValue("released"),
) {
  return render(
    <ReserveAction
      viewerState={viewerState}
      onReserve={onReserve}
      onRelease={onRelease}
    />,
  );
}

describe("ReserveAction", () => {
  it("reserves secretly and disables repeat submission while pending", async () => {
    let finish!: (outcome: "reserved") => void;
    const onReserve = vi.fn(
      () =>
        new Promise<"reserved">((resolve) => {
          finish = resolve;
        }),
    );
    mount("unreserved", onReserve);
    await userEvent.click(
      screen.getByRole("button", { name: "Reserve secretly" }),
    );
    expect(screen.getByRole("button", { name: "Reserving…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reserving…" }));
    expect(onReserve).toHaveBeenCalledOnce();
    await act(async () => finish("reserved"));
  });
  it.each(["conflict", "error"])(
    "keeps a retry beside the reserve action after %s",
    async (outcome) => {
      mount("unreserved", vi.fn().mockResolvedValue(outcome));
      await userEvent.click(
        screen.getByRole("button", { name: "Reserve secretly" }),
      );
      expect(
        await screen.findByText(
          outcome === "conflict"
            ? "Someone beat you to it"
            : "That didn't go through. Try again.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reserve secretly" }),
      ).toBeEnabled();
    },
  );
  it("shows anonymous coordination without allowing another member to reserve or release", () => {
    mount("other");
    expect(screen.getByText("Someone’s on it")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("opens a portal dialog with the safe choice focused and traps focus", async () => {
    const { container } = mount("yours");
    await userEvent.click(
      screen.getByRole("button", { name: "Release reservation" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Release your reservation?",
    });
    expect(container.contains(dialog)).toBe(false);
    expect(
      screen.getByText(
        /Other eligible group members will be able to reserve this gift/,
      ),
    ).toBeInTheDocument();
    const keep = within(dialog).getByRole("button", {
      name: "Keep reservation",
    });
    expect(keep).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Release reservation" }),
    ).toHaveFocus();
    await userEvent.tab();
    expect(keep).toHaveFocus();
  });
  it.each(["escape", "keep", "backdrop"])(
    "%s cancels without writing and restores trigger focus",
    async (method) => {
      const onRelease = vi.fn();
      mount("yours", undefined, onRelease);
      const trigger = screen.getByRole("button", {
        name: "Release reservation",
      });
      await userEvent.click(trigger);
      if (method === "escape") await userEvent.keyboard("{Escape}");
      else if (method === "keep")
        await userEvent.click(
          screen.getByRole("button", { name: "Keep reservation" }),
        );
      else await userEvent.click(screen.getByRole("dialog").parentElement!);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(onRelease).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
    },
  );
  it("blocks dismiss and repeat submission while release is pending", async () => {
    let finish!: (outcome: "released") => void;
    const onRelease = vi.fn(
      () =>
        new Promise<"released">((resolve) => {
          finish = resolve;
        }),
    );
    mount("yours", undefined, onRelease);
    await userEvent.click(
      screen.getByRole("button", { name: "Release reservation" }),
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Release reservation",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Releasing…" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Keep reservation" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(dialog.parentElement!);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Releasing…" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRelease).toHaveBeenCalledOnce();
    await act(async () => finish("released"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it.each(["error", "throw"])(
    "keeps release %s inside the dialog for retry",
    async (outcome) => {
      const onRelease =
        outcome === "throw"
          ? vi.fn().mockRejectedValue(new Error("offline"))
          : vi.fn().mockResolvedValue("error");
      mount("yours", undefined, onRelease);
      await userEvent.click(
        screen.getByRole("button", { name: "Release reservation" }),
      );
      const dialog = screen.getByRole("dialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Release reservation" }),
      );
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "That didn't go through. Try again.",
      );
      expect(
        within(dialog).getByRole("button", { name: "Release reservation" }),
      ).toBeEnabled();
      expect(screen.getByText("Reserved by you")).toBeInTheDocument();
      onRelease.mockResolvedValue("released");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Release reservation" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(onRelease).toHaveBeenCalledTimes(2);
    },
  );
});
