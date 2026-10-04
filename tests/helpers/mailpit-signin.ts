import type { Page } from "@playwright/test";
export async function mailpitLogin(
  page: Page,
  email: string,
  destination: "home" | "onboarding" = "home",
  options?: { authPath?: string; returnPath?: string },
) {
  const origin = process.env.E2E_MAILPIT_URL;
  if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(origin))
    throw new Error("local Mailpit required");
  await page.goto(options?.authPath ?? "/auth");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL("**/auth/verify");
  let code = "";
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = (await fetch(`${origin}/api/v1/messages?limit=100`).then((r) =>
      r.json(),
    )) as { messages: { ID: string; To: { Address: string }[] }[] };
    const mail = list.messages.find((m) =>
      m.To.some((to) => to.Address === email),
    );
    if (mail) {
      const detail = (await fetch(`${origin}/api/v1/message/${mail.ID}`).then(
        (r) => r.json(),
      )) as { Text: string; HTML: string };
      code = (detail.Text || detail.HTML).match(/\b(\d{6})\b/)?.[1] ?? "";
      if (code) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!code) throw new Error("Mailpit sign-in code did not arrive");
  await page.getByRole("textbox", { name: "Digit 1 of 6" }).click();
  await page.keyboard.type(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  const returnPath = options?.returnPath ?? `/${destination}`;
  await page.waitForURL((url) => `${url.pathname}${url.search}` === returnPath);
}
