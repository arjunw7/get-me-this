// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FragmentTarget } from "./fragment-target";

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let height: number;
const scroll = vi.fn();
const originalScroll = HTMLElement.prototype.scrollIntoView;

function advanceFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach((callback) => callback(0)));
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  height = 400;
  scroll.mockClear();
  HTMLElement.prototype.scrollIntoView = scroll;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ height }) as DOMRect,
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  window.history.replaceState(null, "", "/groups/example#wishlists");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  HTMLElement.prototype.scrollIntoView = originalScroll;
  window.history.replaceState(null, "", "/");
});

describe("FragmentTarget", () => {
  it("jumps to the matching target after the route's restoration frame", () => {
    const { container } = render(
      <FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>,
    );
    expect(scroll).not.toHaveBeenCalled();
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
    advanceFrame();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      block: "start",
      behavior: "instant",
    });
    expect(scroll.mock.instances[0]).toBe(
      container.querySelector("#wishlists"),
    );
  });

  it("waits for streamed content when the target is initially empty", async () => {
    height = 0;
    const view = render(<FragmentTarget id="wishlists">{null}</FragmentTarget>);
    advanceFrame();
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
    height = 400;
    await act(async () => {
      view.rerender(
        <FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>,
      );
    });
    advanceFrame();
    advanceFrame();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("does not jump for a different fragment or an ordinary route visit", () => {
    window.history.replaceState(null, "", "/groups/example#other");
    render(<FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>);
    advanceFrame();
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("honors a later hash change on the same mounted room", () => {
    window.history.replaceState(null, "", "/groups/example");
    render(<FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>);
    window.history.replaceState(null, "", "/groups/example#wishlists");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    advanceFrame();
    advanceFrame();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("does not override a user's scroll or a departed fragment", () => {
    render(<FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>);
    advanceFrame();
    act(() => window.dispatchEvent(new WheelEvent("wheel")));
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/groups/example#other");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    advanceFrame();
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("cancels a scheduled jump when the room unmounts", () => {
    const view = render(
      <FragmentTarget id="wishlists">Wishlist rows</FragmentTarget>,
    );
    advanceFrame();
    view.unmount();
    advanceFrame();
    expect(scroll).not.toHaveBeenCalled();
  });
});
