// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OwnerReactionSummaryRow } from "./owner-reaction-summary";
import type { OwnerReactionSummary } from "./reaction-write";

describe("OwnerReactionSummaryRow", () => {
  it("shows `No reactions yet` at zero and no interactive control", () => {
    render(
      <OwnerReactionSummaryRow
        summary={{
          itemId: "item-1",
          counts: { veryYou: 0, questionable: 0, wantItToo: 0 },
        }}
      />,
    );

    expect(screen.getByText("No reactions yet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the per-kind breakdown with counts and no reactor identity", () => {
    render(
      <OwnerReactionSummaryRow
        summary={{
          itemId: "item-1",
          counts: { veryYou: 2, questionable: 1, wantItToo: 3 },
        }}
      />,
    );

    expect(screen.getByText("Very you")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("Questionable")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Want it too")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
