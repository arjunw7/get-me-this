// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("./edit-profile-action", () => ({ editProfileAction: mocks.save }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { EditProfileButton } from "./edit-profile-button";
describe("Edit profile dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.save.mockResolvedValue({ status: "saved" });
  });
  it("opens with real values, traps focus, and returns to its trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<EditProfileButton displayName="Aanya" tasteLine="Tiny luxuries" />);
    const trigger = screen.getByRole("button", { name: "Edit profile" });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Edit your profile" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    expect(
      screen.getByRole("textbox", { name: "Personality line" }),
    ).toHaveValue("Tiny luxuries");
    screen.getByRole("button", { name: "Save changes" }).focus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Close edit profile" }),
    ).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retains edited fields after failure and closes only on committed success", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce({
      status: "error",
      failure: "update-failed",
    });
    render(<EditProfileButton displayName="Aanya" tasteLine="Tiny luxuries" />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Anya");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "couldn’t be saved",
    );
    expect(name).toHaveValue("Anya");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[1][0].get("displayName")).toBe("Anya");
  });
  it("opens with the saved Vibe, retains it after failure, and submits the selected change", async () => {
    const user = userEvent.setup();
    mocks.save.mockResolvedValueOnce({
      status: "error",
      errors: { vibe: "invalid" },
    });
    render(
      <EditProfileButton
        displayName="Aanya"
        tasteLine={null}
        vibe="electric"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(
      screen.getByRole("group", { name: "Choose your Vibe" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Electric" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Acid lime" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose one of the four vibes",
    );
    expect(screen.getByRole("radio", { name: "Acid lime" })).toBeChecked();
    expect(mocks.save.mock.calls[0][0].get("vibe")).toBe("acid_lime");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.save.mock.calls[1][0].get("vibe")).toBe("acid_lime");
  });
  it("discards an unsaved Vibe change when the dialog closes", async () => {
    const user = userEvent.setup();
    render(
      <EditProfileButton displayName="Aanya" tasteLine={null} vibe="tomato" />,
    );
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("radio", { name: "Electric" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByRole("radio", { name: "Tomato" })).toBeChecked();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("prevents cancellation and duplicate submission during an in-flight save", async () => {
    let resolve!: (value: { status: "saved" }) => void;
    mocks.save.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<EditProfileButton displayName="Aanya" tasteLine={null} />);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Close edit profile" }),
    ).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Marigold" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await act(async () => resolve({ status: "saved" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
