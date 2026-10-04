// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Component coverage for the 006d Open group entry point (brief criterion 9):
 * the accepted joined confirmation exposes a working Open group action only
 * when the database returned the accepted group id, and it points only at
 * that id — never a client-supplied destination.
 */

import { InviteJoinedScreen } from "./joined-screen";

const GROUP_ID = "aa1d0f2e-0000-4000-8000-00000000abcd";

describe("InviteJoinedScreen open-group entry", () => {
  it("exposes Open group pointing at the accepted group id", () => {
    render(<InviteJoinedScreen groupName="Diwali Room" groupId={GROUP_ID} />);
    const link = screen.getByTestId("open-group");
    expect(link.getAttribute("href")).toBe(`/groups/${GROUP_ID}`);
    expect(screen.getByRole("link", { name: "Open group" })).toBeTruthy();
  });

  it("renders no Open group action when the projection returned no group id", () => {
    render(<InviteJoinedScreen groupName={null} groupId={null} />);
    expect(screen.queryByTestId("open-group")).toBeNull();
  });

  it("never fabricates room authority from a client-supplied destination", () => {
    render(<InviteJoinedScreen groupName="Diwali Room" />);
    expect(screen.queryByTestId("open-group")).toBeNull();
    // The generic actions remain.
    expect(
      screen.getByRole("link", { name: "Add an item to my wishlist" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to home" })).toBeTruthy();
  });
});
