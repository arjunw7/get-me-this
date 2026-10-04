// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomeLoading from "@/app/home/loading";
import { AppShellLoading } from "./app-shell-loading";

vi.mock("./account-menu", () => ({ AccountMenu: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/groups" }));

describe("route loading feedback", () => {
  it("keeps the primary destinations readable and usable while loading", () => {
    render(<AppShellLoading />);
    const groups = screen.getAllByRole("link", { name: "Groups" });
    expect(groups[0]).toHaveAttribute("href", "/groups");
    expect(groups[0]).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Home" })).toHaveLength(2);
  });

  it("announces Home loading without fading the whole page", () => {
    const { container } = render(<HomeLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your home");
    expect(container.firstElementChild).not.toHaveClass("animate-pulse");
  });
});
