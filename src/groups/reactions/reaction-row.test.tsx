// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactionRow } from "./reaction-row";
import type { ReactionSummaryRow } from "./types";

function summary(
  overrides: Partial<ReactionSummaryRow> = {},
): ReactionSummaryRow {
  return {
    itemId: "item-1",
    counts: { veryYou: 0, questionable: 0, wantItToo: 0 },
    viewerReaction: null,
    ...overrides,
  };
}

describe("ReactionRow", () => {
  it("shows the approved zero-reaction copy and the three labeled choices", () => {
    render(<ReactionRow summary={summary()} onReact={vi.fn()} />);

    expect(screen.getByText("Be the first to react")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Very you" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Questionable, but supported/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Want it too" })).toBeTruthy();
  });

  it("marks the caller's active reaction as pressed", () => {
    render(
      <ReactionRow
        summary={summary({
          viewerReaction: "questionable",
          counts: { veryYou: 0, questionable: 2, wantItToo: 1 },
        })}
        onReact={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: /Questionable, but supported/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(
        screen.getByRole("button", { name: "Questionable, but supported" }),
      ).getByText("2"),
    ).toBeTruthy();
  });

  it.each([false, true])(
    "keeps each stamp counter tied to its reaction (compact=%s)",
    (compact) => {
      const { rerender } = render(
        <ReactionRow
          compact={compact}
          summary={summary({
            counts: { veryYou: 4, questionable: 2, wantItToo: 9 },
          })}
          onReact={vi.fn()}
        />,
      );
      for (const [name, count] of [
        ["Very you", "4"],
        ["Questionable, but supported", "2"],
        ["Want it too", "9"],
      ]) {
        expect(
          within(screen.getByRole("button", { name })).getByText(count),
        ).toBeTruthy();
      }
      rerender(
        <ReactionRow
          compact={compact}
          summary={summary({
            counts: { veryYou: 5, questionable: 2, wantItToo: 9 },
            viewerReaction: "very_you",
          })}
          onReact={vi.fn()}
        />,
      );
      expect(
        within(screen.getByRole("button", { name: "Very you" })).getByText("5"),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: "Very you" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    },
  );

  it("calls onReact with the chosen kind for a fresh reaction", async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReactionRow summary={summary()} onReact={onReact} />);

    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(onReact).toHaveBeenCalledWith("very_you");
  });

  it("calls onReact with null when the active reaction is selected again", async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ReactionRow
        summary={summary({ viewerReaction: "want_it_too" })}
        onReact={onReact}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Want it too" }));
    expect(onReact).toHaveBeenCalledWith(null);
  });

  it("calls onReact with the new kind when switching", async () => {
    const onReact = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ReactionRow
        summary={summary({ viewerReaction: "very_you" })}
        onReact={onReact}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Want it too" }));
    expect(onReact).toHaveBeenCalledWith("want_it_too");
  });

  it("disables the controls while a write is pending", async () => {
    let resolveWrite: () => void = () => {};
    const onReact = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ReactionRow summary={summary()} onReact={onReact} />);

    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(screen.getByRole("group").getAttribute("aria-busy")).toBe("true");
    expect(
      (screen.getByRole("button", { name: "Very you" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    resolveWrite();
  });
});
