// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("./gifting-actions", () => ({ setGiftEntryStatusAction: vi.fn() }));
import { GiftingScreen, type ChecklistRow } from "./gifting-screen";

const row: ChecklistRow = {
  recipientUserId: "friend-one",
  recipientDisplayName: "Friend One",
  recipientIsOrganizer: false,
  entryStatus: "todo",
  entryVersion: 3,
  entryCompletedAt: null,
  participatingMemberCount: 3,
  budgetAmountMinor: 250000,
  budgetCurrency: "INR",
  isSentinel: false,
};

describe("checklist completion and disclosure semantics", () => {
  it("keeps independent completion forms outside native disclosure summaries", () => {
    render(
      <GiftingScreen
        groupId="group-one"
        groupName="Friends"
        rows={[
          row,
          {
            ...row,
            recipientUserId: "friend-two",
            recipientDisplayName: "Friend Two",
            entryStatus: "completed",
          },
        ]}
        conflict={false}
      />,
    );
    const list = screen.getByTestId("checklist-rows");
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.closest("summary")).toBeNull();
      expect(button.closest("details")).toBeNull();
      expect(
        button.closest("li")?.querySelector("details > summary"),
      ).toBeTruthy();
    }
    const complete = screen.getByRole("button", {
      name: "Mark completed: Friend One",
    });
    const form = complete.closest("form")!;
    const fields = new FormData(form);
    expect(fields.get("groupId")).toBe("group-one");
    expect(fields.get("recipientId")).toBe("friend-one");
    expect(fields.get("expectedVersion")).toBe("3");
    expect(fields.get("status")).toBe("completed");
    const reopen = screen.getByRole("button", { name: "Reopen: Friend Two" });
    expect(new FormData(reopen.closest("form")!).get("status")).toBe("todo");
    const disclosures = list.querySelectorAll("details");
    expect(disclosures[0]).toHaveAttribute("open");
    expect(disclosures[1]).not.toHaveAttribute("open");
    expect(
      list.querySelector("summary button, summary input, summary form"),
    ).toBeNull();
  });
});
