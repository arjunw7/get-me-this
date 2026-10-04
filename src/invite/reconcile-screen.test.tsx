// @vitest-environment jsdom
import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "restart" }),
);
vi.mock("./invite-actions", () => ({
  reconcileInvitationAction: reconcile,
  requestInvitationEmailAction: vi.fn(),
  restartInvitationAuthAction: vi.fn(),
  verifyInvitationCodeAction: vi.fn(),
  verifyInvitationLinkAction: vi.fn(),
}));
import { InviteReconcileScreen } from "./invite-auth-screens";

describe("automatic invitation reconciliation", () => {
  it("submits one POST without another click, including React StrictMode", async () => {
    render(
      <StrictMode>
        <InviteReconcileScreen flowId="0f0a0b0c-1111-4222-8333-444455556666" />
      </StrictMode>,
    );
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    expect(reconcile.mock.calls[0][1].get("flowId")).toBe(
      "0f0a0b0c-1111-4222-8333-444455556666",
    );
  });
});
