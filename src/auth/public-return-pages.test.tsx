// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), profile: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/src/profile/session", () => ({
  getSessionUser: mocks.user,
  getOwnProfile: mocks.profile,
}));
vi.mock("@/src/auth/email-entry-form", () => ({
  EmailEntryForm: ({
    intent,
    shareToken,
  }: {
    intent: string;
    shareToken?: string;
  }) => (
    <div data-testid="email" data-intent={intent} data-share={shareToken} />
  ),
}));
vi.mock("@/src/auth/onboarding-form", () => ({
  OnboardingForm: ({ shareToken }: { shareToken?: string }) => (
    <div data-testid="onboarding" data-share={shareToken} />
  ),
}));
import AuthPage from "@/app/auth/page";
import OnboardingPage from "@/app/onboarding/page";
const token = "A".repeat(43);
beforeEach(() => {
  mocks.user.mockResolvedValue({ id: "viewer" });
  mocks.profile.mockResolvedValue({ displayName: null });
});
describe("bounded public wishlist return pages", () => {
  it("passes only a canonical token for the public auth intent", async () => {
    render(
      await AuthPage({
        searchParams: Promise.resolve({
          intent: "public-wishlist",
          share: token,
        }),
      }),
    );
    expect(screen.getByTestId("email")).toHaveAttribute("data-share", token);
    expect(screen.getByTestId("email")).toHaveAttribute(
      "data-intent",
      "public-wishlist",
    );
  });
  it.each(["//evil.example", [token, token]])(
    "rejects invalid or repeated public share query parameters",
    async (share) => {
      render(
        await AuthPage({
          searchParams: Promise.resolve({ intent: "public-wishlist", share }),
        }),
      );
      expect(screen.getByTestId("email")).toHaveAttribute(
        "data-intent",
        "home",
      );
      expect(screen.getByTestId("email")).not.toHaveAttribute("data-share");
    },
  );
  it("preserves the validated identifier in the new-account form", async () => {
    render(
      await OnboardingPage({ searchParams: Promise.resolve({ share: token }) }),
    );
    expect(screen.getByTestId("onboarding")).toHaveAttribute(
      "data-share",
      token,
    );
  });
  it("returns an already-complete profile directly to the public wishlist", async () => {
    mocks.profile.mockResolvedValue({ displayName: "Ada" });
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ share: token }) }),
    ).rejects.toThrow(`redirect:/s/${token}`);
  });
  it("never redirects an already-complete profile to an arbitrary URL", async () => {
    mocks.profile.mockResolvedValue({ displayName: "Ada" });
    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ share: "//evil.example" }),
      }),
    ).rejects.toThrow("redirect:/home");
  });
});
