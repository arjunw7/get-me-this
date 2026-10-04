import { describe, expect, it } from "vitest";

import {
  buttonClassName,
  controlClassName,
  cx,
  surfaceClassName,
  textLinkClassName,
  type ButtonSize,
  type ButtonVariant,
  type SurfaceElevation,
  type SurfaceTone,
} from "./styles";

const VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "subtle",
  "contrast",
];
const SIZES: readonly ButtonSize[] = ["md", "lg"];
const TONES: readonly SurfaceTone[] = ["raised", "sunken", "accent"];
const ELEVATIONS: readonly SurfaceElevation[] = ["none", "sm", "md", "lg"];

describe("cx", () => {
  it("joins only truthy class names", () => {
    expect(cx("a", false, undefined, "b")).toBe("a b");
  });
});

describe("buttonClassName", () => {
  it("applies one background per variant", () => {
    expect(buttonClassName({ variant: "primary", size: "md" })).toContain(
      "bg-action-primary",
    );
    expect(buttonClassName({ variant: "secondary", size: "md" })).toContain(
      "bg-accent-highlight",
    );
    expect(buttonClassName({ variant: "subtle", size: "md" })).toContain(
      "bg-surface-raised",
    );
    expect(buttonClassName({ variant: "contrast", size: "md" })).toContain(
      "bg-outline-strong",
    );
  });

  it("keeps one text colour per variant so utilities never compete", () => {
    expect(buttonClassName({ variant: "contrast", size: "md" })).toContain(
      "text-surface-page",
    );
    expect(buttonClassName({ variant: "primary", size: "md" })).toContain(
      "text-content-primary",
    );
    const classes = new Set(
      buttonClassName({ variant: "contrast", size: "md" }).split(" "),
    );
    expect(classes.has("text-content-primary")).toBe(false);
  });

  it("maps sizes to the control height tokens", () => {
    expect(buttonClassName({ variant: "primary", size: "md" })).toContain(
      "h-control-md",
    );
    expect(buttonClassName({ variant: "primary", size: "lg" })).toContain(
      "h-control-lg",
    );
  });

  it("keeps every variant at or above the minimum touch target", () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        expect(buttonClassName({ variant, size })).toContain("min-h-touch-min");
      }
    }
  });

  it("gates hover and press motion so a disabled control never moves", () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const className = buttonClassName({ variant, size });
        // The gate is :not(:disabled), not :enabled: anchor elements
        // (CtaLink) can never match :enabled, which silenced their hover
        // lift entirely (ARJ-53). Anchors cannot be disabled and always
        // qualify; real buttons are excluded only while disabled.
        expect(className).toContain(
          "[&:not(:disabled)]:hover:-translate-y-0.5",
        );
        expect(className).toContain(
          "[&:not(:disabled)]:active:translate-x-0.5",
        );
        expect(className).toContain(
          "[&:not(:disabled)]:active:translate-y-0.5",
        );
        // No motion utility may exist without the not-disabled gate.
        const ungated = className
          .split(" ")
          .filter((utility) =>
            /^(?:hover:-translate-y|active:translate-[xy]|active:shadow-none)/.test(
              utility,
            ),
          );
        expect(ungated).toEqual([]);
        expect(className).toContain("disabled:cursor-not-allowed");
        expect(className).toContain("disabled:shadow-none");
      }
    }
  });

  it("transitions the translate property so the press motion animates", () => {
    // Tailwind v4 emits translate utilities as the `translate` property; a
    // transition naming only `transform` never animates the lift.
    const className = buttonClassName({ variant: "primary", size: "lg" });
    expect(className).toContain("transition-[transform,translate,box-shadow]");
  });

  it("uses the snap easing and press duration tokens", () => {
    const className = buttonClassName({ variant: "primary", size: "lg" });
    expect(className).toContain("duration-[var(--duration-press)]");
    expect(className).toContain("ease-snap");
  });
});

describe("controlClassName", () => {
  it("uses the control height for single-line inputs", () => {
    const className = controlClassName({ invalid: false, multiline: false });
    expect(className).toContain("h-control-md");
    expect(className).not.toContain("resize-y");
  });

  it("switches to a resizable block for multiline inputs", () => {
    const className = controlClassName({ invalid: false, multiline: true });
    expect(className).toContain("resize-y");
    expect(className).not.toContain("h-control-md");
  });

  it("adds error tokens only when invalid", () => {
    expect(
      controlClassName({ invalid: false, multiline: false }),
    ).not.toContain("border-feedback-error");
    const invalid = controlClassName({ invalid: true, multiline: false });
    expect(invalid).toContain("border-feedback-error");
    expect(invalid).toContain("bg-feedback-error-soft");
  });

  it("never emits competing colour utilities for the same property", () => {
    const invalid = new Set(
      controlClassName({ invalid: true, multiline: false }).split(" "),
    );
    expect(invalid).not.toContain("border-outline-strong");
    expect(invalid).not.toContain("bg-surface-raised");

    const valid = new Set(
      controlClassName({ invalid: false, multiline: false }).split(" "),
    );
    expect(valid).toContain("border-outline-strong");
    expect(valid).toContain("bg-surface-raised");
  });

  it("never suppresses the global focus-visible outline", () => {
    for (const invalid of [false, true]) {
      for (const multiline of [false, true]) {
        const classes = new Set(
          controlClassName({ invalid, multiline }).split(" "),
        );
        expect(classes).not.toContain("outline-none");
        expect(classes).not.toContain("outline-0");
        expect(classes).not.toContain("focus:outline-none");
      }
    }
  });

  it("styles the disabled state and keeps placeholders muted", () => {
    const className = controlClassName({ invalid: false, multiline: false });
    expect(className).toContain("disabled:bg-surface-sunken");
    expect(className).toContain("placeholder:text-content-muted");
  });
});

describe("textLinkClassName", () => {
  it("stays underlined and shifts to the strong action colour on hover", () => {
    const className = textLinkClassName();
    expect(className).toContain("underline");
    expect(className).toContain("hover:text-action-primary-strong");
  });
});

describe("surfaceClassName", () => {
  it("maps every tone and elevation combination to tokens", () => {
    for (const tone of TONES) {
      for (const elevation of ELEVATIONS) {
        const className = surfaceClassName({
          tone,
          elevation,
          padding: "comfortable",
        });
        expect(className).toContain("rounded-surface-lg");
        expect(className).toContain("border-outline-strong");
        expect(className).toContain("p-gutter");
      }
    }
  });

  it("maps elevation to the chunk shadow scale", () => {
    const shadowFor = (elevation: SurfaceElevation) =>
      new Set(
        surfaceClassName({ tone: "raised", elevation, padding: "none" }).split(
          " ",
        ),
      );
    expect(shadowFor("none")).toContain("shadow-none");
    expect(shadowFor("sm")).toContain("shadow-chunk-sm");
    expect(shadowFor("md")).toContain("shadow-chunk");
    expect(shadowFor("lg")).toContain("shadow-chunk-lg");
  });

  it("omits padding classes when padding is none", () => {
    expect(
      surfaceClassName({ tone: "raised", elevation: "md", padding: "none" }),
    ).not.toContain("p-gutter");
  });
});
