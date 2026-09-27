/**
 * SDK-ownership architecture rule tests. Uses the real eslint.config.mjs to
 * prove that direct imports of posthog-js and posthog-node are blocked
 * outside the approved analytics implementation files, and allowed inside
 * them. Product code must import the analytics boundary instead.
 */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

async function lintText(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: projectRoot });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

describe("SDK ownership lint rule", () => {
  it("blocks a posthog-js import from product code", async () => {
    const messages = await lintText(
      'import posthog from "posthog-js";\n',
      "src/product/some-component.tsx",
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("@/src/analytics/client");
  });

  it("blocks a posthog-node import from product code", async () => {
    const messages = await lintText(
      'import { PostHog } from "posthog-node";\n',
      "src/lib/some-server.ts",
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toContain("@/src/analytics/server");
  });

  it("blocks SDK subpath imports from product code", async () => {
    const messages = await lintText(
      'import { init } from "posthog-js/init";\n',
      "src/product/some-component.tsx",
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it("allows SDK imports inside the analytics implementation files", async () => {
    const clientMessages = await lintText(
      'import posthog from "posthog-js";\n',
      "src/analytics/client.ts",
    );
    expect(clientMessages).toEqual([]);

    const serverMessages = await lintText(
      'import { PostHog } from "posthog-node";\n',
      "src/analytics/server.ts",
    );
    expect(serverMessages).toEqual([]);
  });

  it("allows SDK imports from the instrumentation-client hook", async () => {
    const messages = await lintText(
      'import posthog from "posthog-js";\n',
      "instrumentation-client.ts",
    );
    expect(messages).toEqual([]);
  });

  it("allows product code to import the analytics boundary", async () => {
    const messages = await lintText(
      'import { getServerAnalytics } from "@/src/analytics/server";\n',
      "src/product/some-server.ts",
    );
    expect(messages).toEqual([]);
  });
});
