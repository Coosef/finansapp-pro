import { test, expect } from "@playwright/test";
import { PB, BASE_FINDATA, setFindata } from "./helpers.mjs";

// A — Auth: gerçek login UI (DOM) → Dashboard açılır → refresh sonrası session korunur.
test.beforeEach(async () => { await setFindata(BASE_FINDATA); });

test("A — login → Dashboard → refresh session korunur", async ({ page }) => {
  await page.goto("/");
  // Gerçek login formu görünür (DOM)
  await expect(page.getByPlaceholder("sen@ornek.com")).toBeVisible();
  await page.getByPlaceholder("sen@ornek.com").click();
  await page.getByPlaceholder("sen@ornek.com").pressSequentially(PB.email);
  await page.locator('input[type="password"]').first().click();
  await page.locator('input[type="password"]').first().pressSequentially(PB.password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();

  // Yeni kullanıcı onboarding'i → atla
  const atla = page.getByText("Şimdilik atla");
  await atla.click({ timeout: 15000 });

  // Dashboard KPI'ları görünür (kullanıcı-görünür davranış)
  await expect(page.getByText("Toplam Gelir").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Toplam Gider").first()).toBeVisible();
  // seed edilen maaş KPI'a yansıdı (50.000)
  await expect(page.getByText(/50\.000/).first()).toBeVisible();

  // Refresh → session korunur (login formu tekrar gelmez)
  await page.reload();
  await expect(page.getByPlaceholder("sen@ornek.com")).toHaveCount(0);
  const atla2 = page.getByText("Şimdilik atla");
  if (await atla2.count()) await atla2.click();
  await expect(page.getByText("Toplam Gelir").first()).toBeVisible({ timeout: 20000 });
});
