// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { DeleteGroupResult } from "./action-state";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
import { DeleteGroupControl } from "./delete-group-control";
const props = { groupId: "group", groupName: "Birthday crew", version: "4" };
beforeEach(() => vi.clearAllMocks());

it("opens confirmation without deleting; cancel and Escape restore focus", async () => {
  const action = vi.fn();
  render(<DeleteGroupControl {...props} deleteAction={action} />);
  const trigger = screen.getByRole("button", { name: "Delete group" });
  await userEvent.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "Delete Birthday crew?" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  expect(
    screen.getByText(/Everyone keeps their personal wishlist/),
  ).toBeVisible();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete group",
    }),
  ).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(action).not.toHaveBeenCalled();
});

it("submits once, prevents dismissal while pending, and navigates only on success", async () => {
  let finish!: (result: DeleteGroupResult) => void;
  const action = vi.fn(
    () =>
      new Promise<DeleteGroupResult>((resolve) => {
        finish = resolve;
      }),
  );
  render(<DeleteGroupControl {...props} deleteAction={action} />);
  await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
  const confirm = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Delete group",
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(action).toHaveBeenCalledExactlyOnceWith("group", "4");
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("dialog")).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  expect(screen.getByRole("dialog")).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(mocks.replace).not.toHaveBeenCalled();
  await act(async () => finish({ ok: true }));
  expect(mocks.replace).toHaveBeenCalledWith("/groups");
  expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
});

it("keeps errors visible and allows retry without navigating", async () => {
  const action = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ok: false, reason: "unavailable" });
  render(<DeleteGroupControl {...props} deleteAction={action} />);
  await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete group",
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Refresh the page");
  screen.getByRole("dialog").focus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete group",
    }),
  ).toHaveFocus();
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete group",
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("couldn’t delete");
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("uses the version shown at confirmation and requires reconfirmation after a stale result", async () => {
  const action = vi.fn().mockResolvedValue({ ok: false, reason: "stale" });
  const view = render(<DeleteGroupControl {...props} deleteAction={action} />);
  await userEvent.click(screen.getByRole("button", { name: "Delete group" }));
  view.rerender(
    <DeleteGroupControl {...props} version="5" deleteAction={action} />,
  );
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete group",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(action).toHaveBeenCalledExactlyOnceWith("group", "4");
  expect(screen.getByRole("alert")).toHaveTextContent("group changed");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
