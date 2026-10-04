// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import WishlistErrorBoundary from "@/app/wishlist/error";
vi.mock("@/src/home/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/wishlist",
  useRouter: () => ({ refresh: vi.fn() }),
}));
import WishlistLoading from "@/app/wishlist/loading";

afterEach(() => vi.restoreAllMocks());

describe("wishlist route states", () => {
  it("announces loading and shows profile/card skeleton geometry without fake items", () => {
    const { container } = render(<WishlistLoading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your wishlist.",
    );
    expect(container.querySelectorAll(".h-80.animate-pulse")).toHaveLength(3);
    expect(container.querySelector(".h-24.animate-pulse")).not.toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Ceramic pour-over|Fixture Roasters/,
    );
  });

  it("shows generic failure copy and invokes retry without exposing the raw error", () => {
    const reset = vi.fn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <WishlistErrorBoundary
        error={Object.assign(new Error("private provider detail"), {
          digest: "digest-123",
        })}
        reset={reset}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Something went wrong." }),
    ).toBeVisible();
    expect(container.textContent).not.toContain("private provider detail");
    expect(logged).toHaveBeenCalledWith("digest-123");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
