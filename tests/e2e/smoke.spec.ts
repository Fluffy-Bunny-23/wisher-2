import { test, expect } from "@playwright/test";

test("root redirects guests to the dashboard", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /Lists you've visited/ })).toBeVisible();
});

test("login page offers email/password and Google sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with Google/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign up/ })).toBeVisible();
});

test("signup page renders the account form", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /Create your account/ })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel(/Confirm password/)).toBeVisible();
});

test("guest dashboard is accessible without signing in", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /Lists you've visited/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in/ })).toBeVisible();
});

test("protected /settings redirects to /login when signed out", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForURL(/\/login/);
});

test("PWA manifest is served", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.name).toContain("Wisher");
});
