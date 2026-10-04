// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requestCodeAction = vi.fn();

vi.mock("./actions", () => ({
  requestCodeAction: (state: unknown, formData: FormData) =>
    requestCodeAction(state, formData),
}));

const { EmailEntryForm } = await import("./email-entry-form");
import { INTENT_NOTES } from "./fixtures";
import {
  invalidEmailCopy,
  overLimitCopy,
  requestCodeHelpText,
  requestCodePendingText,
  unavailableCopy,
} from "./flow-copy";

/**
 * The email-entry screen of the real flow (004c): client-side validation
 * rejects empty and malformed input before any request; a valid submission
 * calls the server action with the email and the closed-enum intent; and
 * provider failures render from the closed generic set with no
 * account-existence distinction.
 */
const IDLE = { status: "idle" };

beforeEach(() => {
  requestCodeAction.mockReset();
  requestCodeAction.mockResolvedValue(IDLE);
});

function fillAndSubmit(email: string) {
  return async () => {
    await userEvent.type(screen.getByLabelText("Email"), email);
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with email" }),
    );
  };
}

describe("EmailEntryForm client validation", () => {
  it("rejects an empty submission before any request", async () => {
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Continue with email" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter your email to continue.",
    );
    expect(requestCodeAction).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before any request", async () => {
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await fillAndSubmit("not-an-email")();

    expect(screen.getByRole("alert")).toHaveTextContent(invalidEmailCopy);
    expect(requestCodeAction).not.toHaveBeenCalled();
  });

  it("clears the validation error while typing", async () => {
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Continue with email" }),
    );
    expect(screen.getByRole("alert")).toBeVisible();

    await userEvent.type(screen.getByLabelText("Email"), "y");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("EmailEntryForm submission", () => {
  it("submits a valid email with the closed-enum intent to the server action", async () => {
    render(
      <EmailEntryForm intent="wishlist" intentNote={INTENT_NOTES.wishlist} />,
    );

    await fillAndSubmit("you@example.com")();

    await waitFor(() => expect(requestCodeAction).toHaveBeenCalledTimes(1));
    const [, formData] = requestCodeAction.mock.calls[0] as [unknown, FormData];
    expect(formData.get("email")).toBe("you@example.com");
    expect(formData.get("intent")).toBe("wishlist");
  });

  it("renders the over-limit recovery from the closed set", async () => {
    requestCodeAction.mockResolvedValue({
      status: "error",
      failure: "over-limit",
    });
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await fillAndSubmit("you@example.com")();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(overLimitCopy),
    );
  });

  it("renders the generic unavailable recovery from the closed set", async () => {
    requestCodeAction.mockResolvedValue({
      status: "error",
      failure: "unavailable",
    });
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await fillAndSubmit("you@example.com")();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(unavailableCopy),
    );
  });

  it("renders the server-side validation rejection with the same copy as the client", async () => {
    requestCodeAction.mockResolvedValue({
      status: "error",
      failure: "invalid-email",
    });
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    await fillAndSubmit("you@example.com")();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(invalidEmailCopy),
    );
  });
});

describe("EmailEntryForm copy honesty", () => {
  it("promises the working code flow and shows the pending state", async () => {
    requestCodeAction.mockImplementation(
      () => new Promise(() => undefined), // never resolves: pending holds
    );
    render(<EmailEntryForm intent="home" intentNote={INTENT_NOTES.home} />);

    expect(screen.getByText(requestCodeHelpText)).toBeVisible();
    expect(screen.queryByText(/static preview/i)).toBeNull();

    await fillAndSubmit("you@example.com")();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: requestCodePendingText }),
      ).toBeDisabled(),
    );
  });

  it("renders the approved intent notes for wishlist and create-group and none for home", () => {
    for (const [intent, note] of Object.entries(INTENT_NOTES)) {
      const { unmount } = render(
        <EmailEntryForm
          intent={intent as "home" | "wishlist" | "create-group"}
          intentNote={note}
        />,
      );
      if (note === null) {
        expect(screen.queryByText(/First, a quick sign-in/)).toBeNull();
      } else {
        expect(screen.getByText(note)).toBeVisible();
      }
      unmount();
    }
  });
});

it("carries a public wishlist token only in the protected form, with no pending reaction", () => {
  const shareToken = "A".repeat(43);
  render(
    <EmailEntryForm
      intent="public-wishlist"
      intentNote={INTENT_NOTES["public-wishlist"]}
      shareToken={shareToken}
    />,
  );
  const form = screen.getByRole("textbox", { name: "Email" }).closest("form")!;
  expect(new FormData(form).get("share")).toBe(shareToken);
  expect(new FormData(form).get("reaction")).toBeNull();
  expect(form).toHaveAttribute("data-ph-no-capture", "true");
});
