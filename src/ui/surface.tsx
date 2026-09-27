import type { ReactNode } from "react";

import {
  surfaceClassName,
  type SurfaceElevation,
  type SurfacePadding,
  type SurfaceTone,
} from "./styles";

type SurfaceElement = "div" | "section" | "article" | "aside";

export type SurfaceProps = {
  children: ReactNode;
  as?: SurfaceElement;
  tone?: SurfaceTone;
  elevation?: SurfaceElevation;
  padding?: SurfacePadding;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function Surface({
  children,
  as = "div",
  tone = "raised",
  elevation = "md",
  padding = "comfortable",
  ...accessibilityProps
}: SurfaceProps) {
  const Element = as;

  return (
    <Element
      {...accessibilityProps}
      className={surfaceClassName({ tone, elevation, padding })}
    >
      {children}
    </Element>
  );
}
