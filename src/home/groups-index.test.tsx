// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupsIndex } from "./groups-index";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => push.mockClear());

describe("Groups index", () => {
  it("carries the occasion and editable name into the existing creation route", async () => {
    const user = userEvent.setup();
    render(<GroupsIndex groups={{ status: "ready", groups: [] }} />);
    await user.click(screen.getByRole("radio", { name: "Diwali" }));
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue(
      "Diwali night",
    );
    await user.clear(screen.getByRole("textbox", { name: "Group name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Group name" }),
      "Our Diwali",
    );
    const form = screen.getByRole("form", { name: "Create a group" });
    const fields = new FormData(form as HTMLFormElement);
    expect(form).toHaveAttribute("action", "/groups/new");
    expect(form).toHaveAttribute("method", "get");
    expect(fields.get("occasion")).toBe("diwali");
    expect(fields.get("name")).toBe("Our Diwali");
    expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
  });
  it("keeps unsafe invitations on the page and opens a valid invite for review", async () => {
    const user = userEvent.setup();
    render(<GroupsIndex groups={{ status: "ready", groups: [] }} />);
    const field = screen.getByRole("textbox", { name: "Invite link" });
    await user.type(field, `https://other.test/invite/${"A".repeat(43)}`);
    await user.click(screen.getByRole("button", { name: "Join with a link" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "doesn’t look like an invite",
    );
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("data-ph-no-capture");
    fireEvent.change(field, {
      target: { value: `${window.location.origin}/invite/${"A".repeat(43)}` },
    });
    await user.click(screen.getByRole("button", { name: "Join with a link" }));
    expect(push).toHaveBeenCalledWith(`/invite/${"A".repeat(43)}`);
  });
  it("shows only actual projected groups and never fabricates an invitation", () => {
    render(
      <GroupsIndex
        groups={{
          status: "ready",
          groups: [
            {
              groupId: "aa1d0f2e-0000-4000-8000-00000000abcd",
              groupName: "Our housewarming",
              occasion: "Housewarming",
              occasionAt: "2026-11-01 12:00:00",
              timeZone: "Asia/Kolkata",
              location: null,
              mode: "wishlist_only",
              joinedMemberCount: 1,
              callerIsOrganizer: true,
            },
          ],
        }}
      />,
    );
    const groups = screen.getByRole("list", { name: "Your groups" });
    expect(within(groups).getAllByRole("listitem")).toHaveLength(1);
    expect(within(groups).getByRole("link")).toHaveAttribute(
      "href",
      "/groups/aa1d0f2e-0000-4000-8000-00000000abcd",
    );
    expect(groups).toHaveTextContent("1 member · You organize");
    expect(
      screen.queryByRole("button", { name: "Copy invite link" }),
    ).not.toBeInTheDocument();
  });
  it("distinguishes unavailable data from a fresh account", () => {
    render(<GroupsIndex groups={{ status: "unavailable" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    expect(screen.queryByText(/No groups yet/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/groups",
    );
  });
});
