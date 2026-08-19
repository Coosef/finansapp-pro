// Refresh sonrası bulunulan view'da kalma (güvenli nav state, sessionStorage, user-scoped).
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, casKaydet, pbAuth, PB } from "./helpers.mjs";

const heading = (page, ad) => page.getByRole("heading", { name: ad, level: 1 });

async function authAs(email, password) {
  const r = await (await fetch(PB.base + "/api/collections/users/auth-with-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: email, password }) })).json();
  return { token: r.token, userId: r.record.id };
}
async function pbRegister(email, password) {
  await fetch(PB.base + "/api/collections/users/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, passwordConfirm: password }) }).catch(() => {});
}
async function setFindataAs(email, password, findata) {
  const { token, userId } = await authAs(email, password);
  await casKaydet(PB.base, token, userId, findata); // guard: generic PATCH data yasak → CAS ile seed
}

test("N1 — İşlemler → refresh → İşlemler'de kal", async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await expect(heading(page, "İşlemler")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(heading(page, "İşlemler")).toBeVisible({ timeout: 15000 }); // refresh sonrası kaldı
  await expect(heading(page, "Panel")).toHaveCount(0); // Dashboard'a dönmedi
});

test("N2 — başka ana bölüm (Hesaplar) → refresh → aynı bölümde kal", async ({ page }) => {
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
  await page.getByText("Hesaplar").first().click();
  await expect(heading(page, "Hesaplar")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(heading(page, "Hesaplar")).toBeVisible({ timeout: 15000 });
});

test("N3 — logout/login B → eski private view yanlış kullanıcıya taşınmaz (Dashboard)", async ({ page }) => {
  const bEmail = "e2e-nav-b@finansapp.test", bPass = "e2epasswordNavB123";
  await pbRegister(bEmail, bPass);
  await setFindataAs(bEmail, bPass, BASE_FINDATA); // B temiz + onboarding'siz
  await seedSession(page, BASE_FINDATA); // A (fixture)
  await page.goto("/");
  await page.getByText("İşlemler").first().click();
  await expect(heading(page, "İşlemler")).toBeVisible({ timeout: 15000 });
  // Gerçek logout: Ayarlar → Çıkış
  await page.getByText("Ayarlar").first().click();
  await page.getByRole("button", { name: "Çıkış", exact: true }).click();
  // Login B
  await expect(page.getByPlaceholder("sen@ornek.com")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("sen@ornek.com").click();
  await page.getByPlaceholder("sen@ornek.com").pressSequentially(bEmail);
  await page.locator('input[type="password"]').first().click();
  await page.locator('input[type="password"]').first().pressSequentially(bPass);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  // B, A'nın İşlemler view'ına DEĞİL, kendi Dashboard'ına düşer
  await expect(heading(page, "Panel")).toBeVisible({ timeout: 20000 });
  await expect(heading(page, "İşlemler")).toHaveCount(0);
});

test("N4 — geçersiz/stale stored view → Dashboard fallback (crash yok)", async ({ page }) => {
  const { userId } = await pbAuth();
  await seedSession(page, BASE_FINDATA);
  await page.goto("/");
  await expect(heading(page, "Panel")).toBeVisible({ timeout: 15000 });
  await page.evaluate((uid) => sessionStorage.setItem("finansapp:nav:" + uid, "gecersiz_xyz_123"), userId);
  await page.reload();
  await expect(heading(page, "Panel")).toBeVisible({ timeout: 15000 }); // geçersiz → Dashboard
});
