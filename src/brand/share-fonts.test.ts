import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps share fonts paired with the app font sources that generated them", () => {
  // Changing either source requires regenerating/reviewing its image instance.
  const files = {
    "bricolage-grotesque-latin-variable.woff2":
      "9fee080fcc2d2e0ea8c7ce2a58abaa8ba1f40c6e603643327cd5eb6f07db06a8",
    "bricolage-grotesque-share-bold.ttf":
      "59e0e856eb2a23dc29af18b132701b8e2eb68808252b343a26b9d29fcbcbd872",
    "dm-sans-latin-variable.woff2":
      "aa530716b0d351866af7dbfa3eee4120fb36f2d071baff8c234185141865c7ff",
    "dm-sans-share-regular.ttf":
      "69129a8931ae5a93b9a542e24336fd64d9e023fc8fabd7bbaeb9581d097e48a8",
  };
  for (const [name, digest] of Object.entries(files)) {
    expect(
      createHash("sha256")
        .update(readFileSync(`app/fonts/${name}`))
        .digest("hex"),
      name,
    ).toBe(digest);
  }
});
