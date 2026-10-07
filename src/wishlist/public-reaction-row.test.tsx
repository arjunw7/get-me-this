// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PublicReactionRow } from "./public-reaction-row";
const summary = {
  itemId: "item",
  counts: { veryYou: 2, questionable: 3, wantItToo: 4 },
  viewerReaction: "want_it_too" as const,
};
describe("PublicReactionRow", () => {
  it("shows three compact counts with full accessible names and confirmed selection", () => {
    render(<PublicReactionRow summary={summary} onReact={vi.fn()} />);
    const heart = screen.getByRole("button", { name: "Want it too" });
    expect(heart).toHaveAttribute("aria-pressed", "true");
    expect(heart).toHaveAccessibleDescription("4 reactions");
    expect(
      screen.getByRole("button", { name: "Questionable, but supported" }),
    ).toHaveAccessibleDescription("3 reactions");
    expect(screen.queryByText("9 reactions")).not.toBeInTheDocument();
    expect(screen.queryByText("Very you")).not.toBeInTheDocument();
  });
  it("removes an active reaction and disables all choices while saving", async () => {
    let finish!: () => void;
    const onReact = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<PublicReactionRow summary={summary} onReact={onReact} />);
    await user.click(screen.getByRole("button", { name: "Want it too" }));
    expect(onReact).toHaveBeenCalledWith(null);
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Very you" }));
    expect(onReact).toHaveBeenCalledTimes(1);
    finish();
  });
  it("uses the same counts read-only without controls or identities", () => {
    render(<PublicReactionRow summary={summary} />);
    expect(screen.getByLabelText("Very you: 2 reactions")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps an empty read-only summary quiet", () => {
    const { container } = render(
      <PublicReactionRow
        summary={{
          ...summary,
          counts: { veryYou: 0, questionable: 0, wantItToo: 0 },
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
