import { expect, test } from "@playwright/test";

test("onboarding fields use regular padding while email reserves room for its icon", async ({
  page,
}) => {
  await page.goto("/onboarding?state=default");
  for (const label of [
    "What should friends call you?",
    /Describe your taste in one line/i,
  ]) {
    const padding = await page.getByLabel(label).evaluate((input) => {
      const style = getComputedStyle(input);
      return { left: style.paddingLeft, right: style.paddingRight };
    });
    expect(padding).toEqual({ left: "16px", right: "16px" });
  }
  await page.goto("/auth");
  const padding = await page
    .getByLabel("Email", { exact: true })
    .evaluate((input) => getComputedStyle(input).paddingLeft);
  expect(padding).toBe("48px");
});
