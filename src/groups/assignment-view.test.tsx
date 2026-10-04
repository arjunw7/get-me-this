// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssignmentView } from "./assignment-view";

/**
 * Component coverage for the giver-facing assignment surface (brief 008d
 * acceptance criterion 3): exactly the `my_assignment` result, the Member
 * fallback, the neutral invalid state with no recipient identity, the
 * identical zero-rows state, and no internals in the DOM.
 */

describe("AssignmentView", () => {
  it("renders a valid assignment with the recipient display name and new-seen state", () => {
    render(
      <AssignmentView
        assignment={{
          drawVersion: 3,
          recipientId: "00000000-0000-4000-8000-0000000000r1",
          recipientDisplayName: "Dev",
          isValid: true,
          viewedAt: null,
        }}
      />,
    );
    expect(screen.getByTestId("assignment-recipient").textContent).toBe("Dev");
    expect(screen.getByTestId("assignment-seen-state").textContent).toMatch(
      /New/i,
    );
  });

  it("renders the generic Member fallback when the display name is unset", () => {
    render(
      <AssignmentView
        assignment={{
          drawVersion: 3,
          recipientId: "00000000-0000-4000-8000-0000000000r1",
          recipientDisplayName: null,
          isValid: true,
          viewedAt: "2026-10-21T10:00:00Z",
        }}
      />,
    );
    expect(screen.getByTestId("assignment-recipient").textContent).toBe(
      "Member",
    );
    expect(screen.getByTestId("assignment-seen-state").textContent).toMatch(
      /seen/i,
    );
  });

  it("renders the neutral invalid state with no recipient identity anywhere in the DOM", () => {
    render(
      <AssignmentView
        assignment={{
          drawVersion: 4,
          recipientId: null,
          recipientDisplayName: null,
          isValid: false,
          viewedAt: null,
        }}
      />,
    );
    expect(screen.getByTestId("assignment-invalid")).toBeTruthy();
    // No recipient identity, no version number, no internals.
    expect(screen.queryByTestId("assignment-recipient")).toBeNull();
    expect(screen.getByTestId("assignment-section").textContent).not.toMatch(
      /version 4|#4|generation|tombstone/i,
    );
  });

  it("renders the zero-rows state identically for every denial class", () => {
    render(<AssignmentView assignment={null} />);
    expect(screen.getByTestId("assignment-empty")).toBeTruthy();
    // The empty state carries no distinguishing detail whatsoever.
    expect(screen.getByTestId("assignment-section").textContent).toBe(
      "Your drawNo assignment to show yet.",
    );
  });
});
