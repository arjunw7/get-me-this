// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Component coverage for the protected create-group screen (brief 006b):
 * keyboard submission, duplicate-activation resistance, the error summary
 * focus, changed-payload conflict BEFORE the changed payload is sent, the
 * confirmation-only rotation, and the unavailable-session-storage block.
 */

const action = vi.fn<(previous: unknown, data: FormData) => Promise<unknown>>(
  async () => ({
    status: "idle",
  }),
);

import { CreateGroupScreen } from "./create-group-screen";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.sessionStorage.clear();
  // jsdom's crypto may lack subtle/randomUUID depending on the host runtime;
  // provide deterministic fallbacks for the component flow.
  const host = globalThis.crypto as Crypto & {
    subtle?: SubtleCrypto;
    randomUUID?: () => string;
  };
  if (!host.subtle) {
    Object.defineProperty(host, "subtle", {
      value: {
        digest: async (_algorithm: string, bytes: Uint8Array) => {
          const data = new Uint8Array(bytes);
          const view = new ArrayBuffer(32);
          const out = new Uint8Array(view);
          for (let i = 0; i < data.length; i += 1) {
            out[i % 32] = (out[i % 32] + data[i]) % 256;
          }
          return view;
        },
      },
      configurable: true,
    });
  }
  if (!host.randomUUID) {
    Object.defineProperty(host, "randomUUID", {
      value: () => "00000000-0000-4000-8000-00000000000" + (counter++ % 10),
      configurable: true,
    });
  }
});

let counter = 0;

afterEach(() => {
  vi.restoreAllMocks();
});

function renderScreen() {
  return render(<CreateGroupScreen action={action as never} />);
}

/** The happy-path form fill keeps the canonical typed date contract. */
async function fillValidForm(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByLabelText("Group name"), "Rohan turns 27");
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-12-18" },
  });
}

describe("CreateGroupScreen", () => {
  it("keeps the budget numeric for typing and pasted values without losing decimals", async () => {
    const user = userEvent.setup();
    renderScreen();
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(amount);
    await user.type(amount, "12a3b.45");
    expect(amount).toHaveValue("123.45");
    fireEvent.change(amount, { target: { value: "twelve" } });
    expect(amount).toHaveValue("123.45");
    fireEvent.change(amount, { target: { value: "1.2.3" } });
    expect(amount).toHaveValue("123.45");
    await user.clear(amount);
    await user.type(amount, ".50");
    expect(amount).toHaveValue(".50");
  });
  it("submits the calendar date and searched currency through the existing action", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText("Group name"), "Dinner together");
    await user.type(screen.getByLabelText("Date"), "2028-02-28");
    await user.click(screen.getByRole("button", { name: "Choose date" }));
    await user.click(screen.getByRole("button", { name: "February 29, 2028" }));
    const currency = screen.getByRole("combobox", { name: "Currency" });
    await user.click(currency);
    await user.type(currency, "Dollar");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][1];
    expect(data.get("occasionDate")).toBe("2028-02-29");
    expect(data.get("budgetCurrency")).toBe("USD");
  });

  it("still rejects impossible manually typed dates before any action", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText("Group name"), "Dinner together");
    await user.type(screen.getByLabelText("Date"), "2027-02-29");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("Pick the real calendar date.")).toBeVisible();
    expect(screen.getByLabelText("Date")).toHaveValue("2027-02-29");
  });
  it("keeps occasion-picker hints editable and requires the remaining creation fields", async () => {
    const user = userEvent.setup();
    render(
      <CreateGroupScreen
        action={action as never}
        initialName="Diwali night"
        initialOccasion="diwali"
      />,
    );
    expect(screen.getByLabelText("Group name")).toHaveValue("Diwali night");
    expect(screen.getByRole("radio", { name: "Diwali" })).toBeChecked();
    await user.clear(screen.getByLabelText("Group name"));
    await user.type(screen.getByLabelText("Group name"), "Our Diwali");
    await user.click(screen.getByRole("radio", { name: "Eid" }));
    expect(screen.getByLabelText("Group name")).toHaveValue("Our Diwali");
    expect(screen.getByRole("radio", { name: "Eid" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("renders every Version 18 field with persistent labels", () => {
    renderScreen();
    expect(screen.getByText("What are we celebrating?")).toBeTruthy();
    for (const label of [
      "Group name",
      "Occasion",
      "Date",
      "Budget per person",
      "How should people gift?",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const occasion of [
      "Diwali",
      "Eid",
      "Birthday",
      "Wedding",
      "Housewarming",
      "Secret Santa",
      "Something else",
    ]) {
      expect(
        screen.getByRole("radio", { name: new RegExp(`^${occasion}$`) }),
      ).toBeTruthy();
    }
    for (const mode of [
      "Draw names privately",
      "Gift everyone",
      "Share wishlists only",
    ]) {
      expect(
        screen.getByRole("radio", { name: new RegExp(mode) }),
      ).toBeTruthy();
    }
  });

  it("submits with the draft request key, keeping it across unchanged resubmits", async () => {
    const user = userEvent.setup();
    renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
    const [, data] = action.mock.calls[0] as [unknown, FormData];
    const key = data.get("requestKey") as string;
    expect(key).toMatch(UUID_V4);
    // An unchanged resubmit keeps the same key and binding.
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(2);
    });
    const [, second] = action.mock.calls[1] as [unknown, FormData];
    expect(second.get("requestKey")).toBe(key);
  });

  it("surfaces the changed-payload conflict before sending the payload", async () => {
    const user = userEvent.setup();
    renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    // Edit after the submitted attempt, then submit again.
    await user.type(screen.getByLabelText("Group name"), "!");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(await screen.findByTestId("idempotency-conflict")).toBeTruthy();
    // The changed payload was never sent: still exactly one action call.
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("rotates the key only through the explicit confirmation", async () => {
    const user = userEvent.setup();
    renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText("Group name"), "!");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await screen.findByTestId("idempotency-conflict");

    // Cancel retains the original key and attempted binding.
    await user.click(
      screen.getByRole("button", { name: "Keep my earlier attempt" }),
    );
    expect(screen.queryByTestId("idempotency-conflict")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Create group" }));
    await screen.findByTestId("idempotency-conflict");
    await user.click(
      screen.getByRole("button", { name: "Submit changes as a new request" }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const [, first] = action.mock.calls[0] as [unknown, FormData];
    const [, second] = action.mock.calls[1] as [unknown, FormData];
    expect(second.get("requestKey")).not.toBe(first.get("requestKey"));
  });

  it("blocks submission with a safe recovery error when storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderScreen();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(
      await screen.findByText(
        /cannot safely remember an unfinished group creation/i,
      ),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: "Create group",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows client field errors and keeps every entered value", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByLabelText("Group name"), "Rohan turns 27");
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(
      await screen.findByText("Pick the real calendar date."),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Group name") as HTMLInputElement).value,
    ).toBe("Rohan turns 27");
  });

  it("renders the pending state and resists duplicate activation", async () => {
    const user = userEvent.setup();
    let resolveAction: ((value: unknown) => void) | undefined;
    action.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderScreen();
    await fillValidForm(user);
    const button = screen.getByRole("button", {
      name: "Create group",
    }) as HTMLButtonElement;
    await user.click(button);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(button.disabled).toBe(true);
    resolveAction?.({ status: "idle" });
  });
});
