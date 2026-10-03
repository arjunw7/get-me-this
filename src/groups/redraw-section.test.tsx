// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RedrawSection } from "./redraw-section";

/**
 * Component coverage for the organizer-only draw surface (brief 008d
 * acceptance criterion 4): explicit confirmation with the supersession
 * consequences, the confirmed expected version passing through to the
 * compare-and-swap, the stale/blocked notices, and the unattributed
 * roster-departure alert.
 */

const GROUP_ID = "00000000-0000-4000-8000-0000000000e0";

const drawState = {
  drawVersion: 2,
  drawnAt: "2026-10-21T09:00:00Z",
  participantCount: 4,
  rosterInSync: true,
};

function renderSection(
  props: Partial<Parameters<typeof RedrawSection>[0]> = {},
) {
  const drawAction = vi.fn(async (_formData: FormData) => {});
  render(
    <RedrawSection
      groupId={GROUP_ID}
      drawState={drawState}
      drawNotice={null}
      drawAction={drawAction}
      {...props}
    />,
  );
  return { drawAction };
}

describe("RedrawSection", () => {
  it("requires explicit confirmation and states the supersession consequences", async () => {
    const { drawAction } = renderSection();
    expect(drawAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("draw-consequences").textContent).toMatch(
      /every current assignment will be replaced/i,
    );
    expect(screen.getByTestId("draw-consequences").textContent).toMatch(
      /only after the redraw/i,
    );

    await userEvent.click(screen.getByTestId("draw-confirm-button"));
    expect(drawAction).toHaveBeenCalledTimes(1);
    const formData = drawAction.mock.calls[0][0] as FormData;
    expect(formData.get("groupId")).toBe(GROUP_ID);
    // The confirmed expected version passes through to the CAS untouched.
    expect(formData.get("expectedDrawVersion")).toBe("2");
  });

  it("passes an empty expected version for the first draw", async () => {
    const { drawAction } = renderSection({ drawState: null });
    await userEvent.click(screen.getByTestId("draw-confirm-button"));
    const formData = drawAction.mock.calls[0][0] as FormData;
    expect(formData.get("expectedDrawVersion")).toBe("");
  });

  it("renders the stale notice as refreshed state, never a retry", () => {
    renderSection({ drawNotice: "stale" });
    expect(screen.getByTestId("draw-stale").textContent).toMatch(
      /nothing was redrawn/i,
    );
    // No automatic retry: the confirm control stays an explicit user action.
    expect(screen.getByTestId("draw-confirm-button")).toBeTruthy();
  });

  it("renders the insufficient-participants blocked state naming the minimum", () => {
    renderSection({ drawState: null, drawNotice: "insufficient" });
    expect(screen.getByTestId("draw-blocked").textContent).toMatch(
      /at least 2 participating members/i,
    );
  });

  it("renders the departure alert with no member attribution", () => {
    renderSection({ drawState: { ...drawState, rosterInSync: false } });
    const alert = screen.getByTestId("roster-out-of-sync");
    expect(alert.textContent).toMatch(/roster has changed/i);
    // Existence metadata only: the alert never names or counts who left.
    expect(alert.textContent).not.toMatch(/left|removed|departed/i);
  });

  it("renders exactly the draw-state metadata and no pair or giver content", () => {
    renderSection();
    expect(screen.getByTestId("draw-version").textContent).toBe("#2");
    expect(screen.getByTestId("draw-participants").textContent).toBe(
      "4 people",
    );
    expect(screen.getByTestId("draw-section").textContent).not.toMatch(
      /giver|recipient/i,
    );
  });
});
