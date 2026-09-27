import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Component tests render into a shared jsdom document; without cleanup the
// first render would leak into every later test in the same file.
afterEach(() => {
  cleanup();
});
