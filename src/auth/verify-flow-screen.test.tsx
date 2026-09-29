// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

const verifyCodeAction = vi.fn();
const resendCodeAction = vi.fn();
const cancelAuthFlowAction = vi.fn();
const signOutAction = vi.fn();

vi.mock("./actions", () => ({
  verifyCodeAction: (state: unknown, formData: FormData) =>
    verifyCodeAction(state, formData),
  resendCodeAction: (state: unknown) => resendCodeAction(state),
  cancelAuthFlowAction: (...args: unknown[]) => cancelAuthFlowAction(...args),
  signOutAction: (...args: unknown[]) => signOutAction(...args),
}));

const { VerifyFlowScreen } = await import("./verify-flow-screen");
import { RESEND_COOLDOWN_SECONDS } from "./flow-config";
import {
  changeEmailLabel,
  overLimitCopy,
  rejectedCodeCopy,
  resendButtonLabel,
  resendCountdownLabel,
  shortCodeCopy,
  signOutLabel,
  signedInHeading,
  signedInText,
  unavailableCopy,
  verifyHeading,
  verifyIntroText,
  verifySubmitLabel,
} from "./flow-copy";

/**
 * The real verify screen (004c): six-digit verification through the server
 * action using the carried email, closed generic failure recovery, the
 * signed-in boundary with the minimal local-scoped sign-out, a countdown
 * sourced from the named server-side constant, and no link invitation.
 */
const IDLE = { status: "idle" };
const replace = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  verifyCodeAction.mockResolvedValue(IDLE);
  resendCodeAction.mockResolvedValue(IDLE);
  cancelAuthFlowAction.mockResolvedValue(undefined);
  signOutAction.mockResolvedValue(undefined);
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
});

function typeCode(code: string) {
  return async () => {
    await userEvent.click(
      screen.getByRole("textbox", { name: "Digit 1 of 6" }),
    );
    await userEvent.paste(code);
  };
}

describe("VerifyFlowScreen entry state", () => {
  it("renders the carried email and a countdown sourced from the server constant", () => {
    render(
      <VerifyFlowScreen
        email="you@example.com"
        resendSeconds={RESEND_COOLDOWN_SECONDS}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: verifyHeading }),
    ).toBeVisible();
    expect(screen.getByText(verifyIntroText("you@example.com"))).toBeVisible();
    // The displayed countdown reflects the configured provider limit.
    expect(
      screen.getByText(resendCountdownLabel(RESEND_COOLDOWN_SECONDS)),
    ).toBeVisible();
    expect(screen.queryByText(/static preview|preview only/i)).toBeNull();
  });

  it("rejects an incomplete code before any request with the designed copy", async () => {
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(shortCodeCopy);
    expect(verifyCodeAction).not.toHaveBeenCalled();
  });

  it("submits the complete code to the server action", async () => {
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await typeCode("123456")();
    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    await waitFor(() => expect(verifyCodeAction).toHaveBeenCalledTimes(1));
    const [, formData] = verifyCodeAction.mock.calls[0] as [unknown, FormData];
    expect(formData.get("code")).toBe("123456");
  });

  it("renders the rejected-code recovery from the closed generic set", async () => {
    verifyCodeAction.mockResolvedValue({
      status: "error",
      failure: "rejected-code",
    });
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await typeCode("000000")();
    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(rejectedCodeCopy),
    );
  });

  it("renders the over-limit recovery panel and restarts the countdown, whatever the clock said", async () => {
    // The clock says the resend is due (countdown elapsed), the provider
    // refuses the too-early send, and the provider's response wins: the
    // over-limit panel renders and the countdown restarts.
    resendCodeAction.mockResolvedValue({
      status: "error",
      failure: "over-limit",
    });
    vi.useFakeTimers();
    render(
      <VerifyFlowScreen
        email="you@example.com"
        resendSeconds={RESEND_COOLDOWN_SECONDS}
      />,
    );

    const tick = () => act(() => vi.advanceTimersByTime(1000));
    for (let i = 0; i < RESEND_COOLDOWN_SECONDS; i += 1) tick();

    await act(async () => {
      screen.getByRole("button", { name: resendButtonLabel }).click();
    });

    expect(resendCodeAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Hold on\./)).toBeVisible();
    expect(screen.getByText(overLimitCopy)).toBeVisible();
    // The countdown restarted from the named server-side constant.
    expect(
      screen.getByText(resendCountdownLabel(RESEND_COOLDOWN_SECONDS)),
    ).toBeVisible();
  });

  it("renders the generic unavailable recovery", async () => {
    verifyCodeAction.mockResolvedValue({
      status: "error",
      failure: "unavailable",
    });
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await typeCode("000000")();
    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(unavailableCopy),
    );
  });

  it("navigates back to the entry screen when the server reports a restart", async () => {
    verifyCodeAction.mockResolvedValue({ status: "restart" });
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await typeCode("000000")();
    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
  });

  it("clears the carry cookie through the explicit cancel control", async () => {
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await userEvent.click(
      screen.getAllByRole("button", { name: changeEmailLabel })[0],
    );

    await waitFor(() => expect(cancelAuthFlowAction).toHaveBeenCalledTimes(1));
  });

  it("offers the resend control once the countdown elapses, under controlled time", async () => {
    vi.useFakeTimers();
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    // One act step per second: the recurring countdown timer fires each step.
    const tick = () => act(() => vi.advanceTimersByTime(1000));
    expect(
      screen.getByText(resendCountdownLabel(RESEND_COOLDOWN_SECONDS)),
    ).toBeVisible();
    for (let i = 0; i < RESEND_COOLDOWN_SECONDS; i += 1) tick();

    const resend = screen.getByRole("button", { name: resendButtonLabel });
    await act(async () => {
      resend.click();
    });
    expect(resendCodeAction).toHaveBeenCalledTimes(1);
  });
});

describe("VerifyFlowScreen signed-in boundary", () => {
  it("shows the approved signed-in state with the minimal sign-out control", async () => {
    render(
      <VerifyFlowScreen
        email="you@example.com"
        resendSeconds={RESEND_COOLDOWN_SECONDS}
        signedIn
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: signedInHeading }),
    ).toBeVisible();
    expect(screen.getByText(signedInText("you@example.com"))).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: signOutLabel }));
    expect(signOutAction).toHaveBeenCalledTimes(1);
  });

  it("reaches the signed-in state after a successful verification", async () => {
    verifyCodeAction.mockResolvedValue({ status: "verified" });
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);

    await typeCode("123456")();
    await userEvent.click(
      screen.getByRole("button", { name: verifySubmitLabel }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: signedInHeading }),
      ).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: signOutLabel })).toBeVisible();
  });

  it("claims no destination that does not exist yet", () => {
    render(
      <VerifyFlowScreen
        email="you@example.com"
        resendSeconds={RESEND_COOLDOWN_SECONDS}
        signedIn
      />,
    );
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/wishlist|your groups|continue to|go to \//i);
  });
});

describe("VerifyFlowScreen copy honesty", () => {
  it("never invites the emailed sign-in link and never reads as a preview", () => {
    render(<VerifyFlowScreen email="you@example.com" resendSeconds={60} />);
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/sign-in link|tap .* in the email|either works/i);
    expect(body).not.toMatch(/static preview|preview only/i);
  });
});
