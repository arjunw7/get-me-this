// @vitest-environment jsdom
import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

/**
 * The 005f state-machine coverage (component harness): initial entry,
 * bounded extracting (success, typed failures, 429/503, 12-second expiry,
 * cancel), complete and partial review, failed/blocked manual fallback,
 * validation-error retention, submission conflict, Start-over key
 * rotation, and the two hidden save fields (candidateImageUrl,
 * reviewPhase). The only network call is the same-origin extract route,
 * stubbed here; saves go through the mocked 005f action.
 */

const mocks = vi.hoisted(() => ({
  createReviewedItemAction: vi.fn(),
}));

vi.mock("./review-actions", () => ({
  createReviewedItemAction: (state: unknown, data: FormData) =>
    mocks.createReviewedItemAction(state, data),
}));

import { AddItemFlow } from "./add-item-flow";

const COMPLETE_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  retailer: "Fixture Shop",
  originalAmountMinor: "2499",
  originalCurrency: "INR",
  candidateImageUrls: [
    "https://img.example/lamp-1.webp",
    "https://img.example/lamp-2.webp",
  ],
};

function extractResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(
  handler: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
): Mock {
  const stub = vi.fn(handler);
  vi.stubGlobal("fetch", stub);
  return stub;
}

function extractCallBody(stub: Mock, call: number): unknown {
  const [, init] = stub.mock.calls[call] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

async function submitLink(
  user: ReturnType<typeof userEvent.setup>,
  url: string,
) {
  await user.type(screen.getByLabelText("Product link"), url);
  await user.click(screen.getByRole("button", { name: "Fetch details" }));
}

beforeEach(() => {
  mocks.createReviewedItemAction
    .mockReset()
    .mockResolvedValue({ status: "idle" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("initial URL entry", () => {
  it("renders the V18 input composition with the Paste helper, help line, and manual affordance", () => {
    render(<AddItemFlow initialUrl="" />);

    expect(
      screen.getByRole("heading", {
        name: "Drop the link. We’ll do the nosy part.",
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Product link")).toBeVisible();
    expect(screen.getByRole("button", { name: "Paste" })).toBeVisible();
    expect(
      screen.getByText(
        "Works with Amazon, Myntra, Nykaa, Etsy, Uniqlo and most shops.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Fetch details" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "No link? Add it manually" }),
    ).toBeVisible();
  });

  it("seeds the field from the ?url= route parameter and starts extraction straight away", async () => {
    const stub = stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="https://shop.example/product/lamp" />);

    await waitFor(() =>
      expect(extractCallBody(stub, 0)).toEqual({
        url: "https://shop.example/product/lamp",
      }),
    );
    expect(await screen.findByText("Found it. Look right?")).toBeVisible();
    expect(screen.getByLabelText("Item name")).toHaveValue(
      "Mushroom ceramic table lamp",
    );
  });

  it("fires the ?url= auto-extraction exactly once across a StrictMode double mount", async () => {
    // Development StrictMode mounts, runs the effect, runs its cleanup,
    // and remounts with the same refs. A kick scheduled behind a timeout
    // would be cleared by the cleanup and never re-fired (the ref already
    // consumed) — the exact dev defect this pins: the kick must be called
    // directly in the effect body and run once and only once.
    const stub = stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(
      <StrictMode>
        <AddItemFlow initialUrl="https://shop.example/product/lamp" />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(extractCallBody(stub, 0)).toEqual({
        url: "https://shop.example/product/lamp",
      }),
    );
    expect(stub).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Found it. Look right?")).toBeVisible();
  });

  it("requires a link before fetching", async () => {
    const user = userEvent.setup();
    render(<AddItemFlow initialUrl="" />);
    await user.click(screen.getByRole("button", { name: "Fetch details" }));
    expect(screen.getByText("Paste a link first.")).toBeVisible();
  });

  it("goes to deliberate manual entry with the URL prefilled and no failure banner", async () => {
    const user = userEvent.setup();
    render(<AddItemFlow initialUrl="" />);
    await user.type(
      screen.getByLabelText("Product link"),
      "https://shop.example/product/lamp",
    );
    await user.click(
      screen.getByRole("button", { name: "No link? Add it manually" }),
    );
    expect(screen.getByText("Add it manually")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Link (optional)")).toHaveValue(
      "https://shop.example/product/lamp",
    );
  });
});

describe("extracting", () => {
  it("shows the bounded loading composition with the host line and Cancel", async () => {
    const user = userEvent.setup();
    stubFetch(() => new Promise<Response>(() => undefined)); // never settles
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://www.shop.example/product/lamp");

    expect(screen.getByText("Being nosy…")).toBeVisible();
    expect(screen.getByText("Reading shop.example")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    // The status region announces politely.
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("cancels back to initial entry with the URL preserved", async () => {
    const user = userEvent.setup();
    stubFetch(
      (_input: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByLabelText("Product link")).toHaveValue(
      "https://shop.example/product/lamp",
    );
  });

  it("the 12-second client wait expires into the failed state with the URL preserved", async () => {
    // fireEvent keeps this test free of userEvent's own timer usage while
    // the suite runs under fake timers.
    vi.useFakeTimers();
    stubFetch(
      (_input: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    render(<AddItemFlow initialUrl="" />);
    fireEvent.change(screen.getByLabelText("Product link"), {
      target: { value: "https://shop.example/product/lamp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch details" }));
    expect(screen.getByText("Being nosy…")).toBeVisible();

    await vi.advanceTimersByTimeAsync(12_001);

    // The expiry resolves to the failed/manual state with the URL kept.
    expect(screen.getByText("That link played hard to get.")).toBeVisible();
    expect(
      (screen.getByLabelText("Link (optional)") as HTMLInputElement).value,
    ).toBe("https://shop.example/product/lamp");
  });
});

describe("extracted and partial review", () => {
  it("prefills the complete review from the result and renders the chooser", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toHaveValue(
      "Mushroom ceramic table lamp",
    );
    expect(screen.getByLabelText("Shop (optional)")).toHaveValue(
      "Fixture Shop",
    );
    expect(screen.getByLabelText("Price")).toHaveValue("24.99");
    expect(screen.getByLabelText("Currency")).toHaveValue("INR");
    expect(screen.getByLabelText("Link (optional)")).toHaveValue(
      "https://shop.example/product/lamp",
    );
    // The chooser: both candidates plus the explicit no-photo option.
    expect(screen.getByRole("radio", { name: "Photo option 1" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Photo option 2" }),
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "No photo" })).not.toBeChecked();
  });

  it("a partial result renders the generic notice with empty and placeholder gaps", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(
        extractResponse(200, {
          result: {
            sourceUrl: "https://shop.example/product/lamp",
            title: "Mushroom ceramic table lamp",
            candidateImageUrls: [],
          },
        }),
      ),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    expect(
      screen.getByText(
        "Some details couldn’t be read. Fill in anything missing below.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Shop (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Price")).toHaveValue("");
    expect(
      screen.getByText("Photo preview — adding photos isn’t available yet."),
    ).toBeVisible();
  });

  it("a result priced in a valid ISO currency outside the supported table reviews as partial with the price left empty", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(
        extractResponse(200, {
          result: {
            sourceUrl: "https://shop.example/product/lamp",
            title: "Mushroom ceramic table lamp",
            retailer: "Fixture Shop",
            originalAmountMinor: "2499",
            originalCurrency: "XPT",
            candidateImageUrls: ["https://img.example/lamp-1.webp"],
          },
        }),
      ),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    // The unrenderable price classifies the result as partial — never
    // silently dropped under a "complete" notice.
    expect(
      screen.getByText(
        "Some details couldn’t be read. Fill in anything missing below.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Price")).toHaveValue("");
  });

  it("nothing is saved until the explicit submit", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");
    expect(mocks.createReviewedItemAction).not.toHaveBeenCalled();
  });

  it("selecting another candidate replaces the selection and No photo declines all", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    await user.click(screen.getByRole("radio", { name: "Photo option 2" }));
    expect(screen.getByRole("radio", { name: "Photo option 2" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Photo option 1" }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "No photo" }));
    expect(screen.getByRole("radio", { name: "No photo" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() =>
      expect(mocks.createReviewedItemAction).toHaveBeenCalledTimes(1),
    );
    const data = mocks.createReviewedItemAction.mock.calls[0][1] as FormData;
    expect(data.get("candidateImageUrl")).toBe("");
  });

  it("re-running extraction keeps the draft's submission key and retains fields the new result does not propose", async () => {
    const user = userEvent.setup();
    const stub = stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");
    const submissionId = (
      document.querySelector('input[name="submissionId"]') as HTMLInputElement
    ).value;

    await user.type(screen.getByLabelText("Note (optional)"), "The cream one.");
    // The re-run resolves quickly, so the second implementation is
    // installed before clicking; the call count proves the re-extract.
    stub.mockImplementation(() =>
      Promise.resolve(
        extractResponse(200, {
          result: {
            sourceUrl: "https://shop.example/product/lamp",
            title: "Corrected lamp title",
            candidateImageUrls: [],
          },
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Try the link again" }),
    );
    await screen.findByText("Found it. Look right?");

    expect(screen.getByLabelText("Item name")).toHaveValue(
      "Corrected lamp title",
    );
    // The note was entered by the user and the new result proposes none.
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(
      "The cream one.",
    );
    expect(
      (document.querySelector('input[name="submissionId"]') as HTMLInputElement)
        .value,
    ).toBe(submissionId);
    expect(extractCallBody(stub, 1)).toEqual({
      url: "https://shop.example/product/lamp",
    });
  });

  it("Start over clears the fields and rotates the submission key", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");
    const firstId = (
      document.querySelector('input[name="submissionId"]') as HTMLInputElement
    ).value;

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByLabelText("Product link")).toBeVisible();
    // The rotated key is visible on the next draft's hidden input.
    await user.click(
      screen.getByRole("button", { name: "No link? Add it manually" }),
    );
    const secondId = (
      document.querySelector('input[name="submissionId"]') as HTMLInputElement
    ).value;
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
    expect(screen.getByLabelText("Item name")).toHaveValue("");
  });
});

describe("failed extraction, blocked URLs, and admission denials", () => {
  const failureCases = [
    ["invalid_url", 422],
    ["blocked_url", 422],
    ["unavailable", 422],
    ["timeout", 504],
    ["too_large", 413],
    ["unsupported_content", 422],
    ["extraction_failed", 422],
    ["admission rate denial", 429],
    ["admission concurrency denial", 503],
  ] as const;

  for (const [label, status] of failureCases) {
    it(`the ${label} response resolves to the generic manual fallback with data preserved`, async () => {
      const user = userEvent.setup();
      stubFetch(() =>
        Promise.resolve(
          extractResponse(status, {
            error: { code: "unavailable", message: "Generic safe copy." },
          }),
        ),
      );
      render(<AddItemFlow initialUrl="" />);
      await submitLink(user, "https://shop.example/product/lamp");

      await screen.findByText("That link played hard to get.");
      // Generic wording: nothing distinguishes blocked, denied, or failed.
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn’t read that shop.",
      );
      expect(screen.getByLabelText("Link (optional)")).toHaveValue(
        "https://shop.example/product/lamp",
      );
      expect(screen.queryByText(/Generic safe copy/)).toBeNull();
      expect(screen.queryByText(String(status))).toBeNull();
    });
  }

  it("a malformed or unexpected response renders the generic failure and leaks nothing", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(
        extractResponse(200, {
          result: { sourceUrl: "https://secret.example/x", stolen: "payload" },
        }),
      ),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");

    await screen.findByText("That link played hard to get.");
    expect(screen.getByLabelText("Link (optional)")).toHaveValue(
      "https://shop.example/product/lamp",
    );
    expect(screen.queryByText(/secret\.example|payload/)).toBeNull();
  });

  it("saving from the fallback persists reviewPhase 'manual' with the URL in the draft", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(
        extractResponse(422, {
          error: {
            code: "blocked_url",
            message: "That link cannot be accessed.",
          },
        }),
      ),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("That link played hard to get.");
    await user.type(
      screen.getByLabelText("Item name"),
      "Lamp from the fallback",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(mocks.createReviewedItemAction).toHaveBeenCalledTimes(1),
    );
    const data = mocks.createReviewedItemAction.mock.calls[0][1] as FormData;
    expect(data.get("reviewPhase")).toBe("manual");
    expect(data.get("candidateImageUrl")).toBe("");
    expect(data.get("title")).toBe("Lamp from the fallback");
    expect(data.get("sourceUrl")).toBe("https://shop.example/product/lamp");
  });
});

describe("save states", () => {
  it("submits the review with the selected candidate and reviewPhase 'extracted'", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(mocks.createReviewedItemAction).toHaveBeenCalledTimes(1),
    );
    const data = mocks.createReviewedItemAction.mock.calls[0][1] as FormData;
    expect(data.get("reviewPhase")).toBe("extracted");
    expect(data.get("candidateImageUrl")).toBe(
      "https://img.example/lamp-1.webp",
    );
    expect(data.get("title")).toBe("Mushroom ceramic table lamp");
    expect(data.get("amount")).toBe("24.99");
    expect(data.get("currency")).toBe("INR");
  });

  it("renders field errors with every raw entered value retained", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    mocks.createReviewedItemAction.mockResolvedValue({
      status: "invalid",
      errors: { title: "Use 200 characters or fewer." },
    });
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText("Use 200 characters or fewer."),
    ).toBeVisible();
    expect(screen.getByLabelText("Item name")).toHaveValue(
      "Mushroom ceramic table lamp",
    );
    expect(screen.getByLabelText("Item name")).toHaveFocus();
  });

  it("renders the submission-conflict state with the draft retained and the edit offer", async () => {
    const user = userEvent.setup();
    stubFetch(() =>
      Promise.resolve(extractResponse(200, { result: COMPLETE_RESULT })),
    );
    render(<AddItemFlow initialUrl="" />);
    await submitLink(user, "https://shop.example/product/lamp");
    await screen.findByText("Found it. Look right?");

    mocks.createReviewedItemAction.mockResolvedValue({
      status: "submission-conflict",
      savedItemId: "00000000-0000-4000-8000-0000000000b0",
      errors: {
        submissionId: "This item entry conflicted. Start over to try again.",
      },
    });
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText(
        "This entry was already saved with different details. Your updated draft is still here.",
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("Item name")).toHaveValue(
      "Mushroom ceramic table lamp",
    );
    expect(
      screen.getByRole("link", { name: "Edit saved item" }),
    ).toHaveAttribute(
      "href",
      "/wishlist/items/00000000-0000-4000-8000-0000000000b0/edit",
    );
  });
});
