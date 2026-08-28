// F1 — React.StrictMode lifecycle smoke (YALNIZ vite dev; production preview bunu kanıtlayamaz).
// StrictMode development'ta efekt kurulum→temizlik→kurulum probu yapar. Mounted-ref ikinci
// kurulumda TRUE'ya dönmezse tüm async Telegram sonuçları yok sayılır → kart sonsuza dek
// "Telegram bağlantı durumu kontrol ediliyor…" ekranında kalırdı.
import { test, expect } from "@playwright/test";
import { seedSession, BASE_FINDATA, PB } from "./helpers.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signHeaders } from "./tg-hmac.mjs";

const TG = JSON.parse(readFileSync(join(process.cwd(), "e2e", ".t1c-runtime.json"), "utf8"));
const TGID = "770000999888";
const KOD_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

async function svc(path, body) {
  const raw = JSON.stringify(body);
  const headers = signHeaders({ secret: TG.gwSecret, method: "POST", path, rawBody: raw });
  const res = await fetch(PB.base + path, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: raw });
  let json = null;
  try { json = await res.json(); } catch { /* boş */ }
  return { status: res.status, json };
}
const telegramKart = (page) => page.locator(".fa-card").filter({ hasText: "Entegrasyonlar" });

test.beforeEach(async ({ page }) => {
  await svc("/api/tg/service/unlink", { telegram_user_id: TGID });
  await seedSession(page, BASE_FINDATA);
});

test("TC-R00 StrictMode (dev): durum çözülür, kart 'yükleniyor'da TAKILMAZ", async ({ page }) => {
  await page.goto("/");
  // Gerçekten DEVELOPMENT derlemesi mi? (@vitejs/plugin-react dev preamble işareti + dev modülü)
  // Aksi halde bu test StrictMode probunu kanıtlamış SAYILMAZ — yanlış-pozitif geçiş olmasın.
  const devModu = await page.evaluate(() => ({
    preamble: !!window.__vite_plugin_react_preamble_installed__,
    devScript: !!document.querySelector('script[src*="/@vite/client"], script[src*="/src/main.jsx"]'),
  }));
  expect(devModu.preamble || devModu.devScript).toBe(true); // StrictMode çift-çağrısı yalnız dev'de

  await page.getByText("Ayarlar").first().click();
  const kart = telegramKart(page);
  await expect(kart).toBeVisible({ timeout: 20000 });
  // Kalıcı "yükleniyor" YOK → durum çözüldü (bagsiz).
  await expect(kart.getByText("Telegram bağlantı durumu kontrol ediliyor…")).toHaveCount(0, { timeout: 20000 });
  await expect(kart.getByRole("button", { name: "Telegram'ı Bağla" })).toBeVisible();

  // StrictMode altında tam akış da çalışmalı: kod üret → gateway tüketir → "● Bağlı".
  await kart.getByRole("button", { name: "Telegram'ı Bağla" }).click();
  await expect(kart.getByText("Telegram bağlantı kodun")).toBeVisible({ timeout: 20000 });
  const kod = (await kart.getByText(KOD_RE).first().innerText()).trim();
  expect(kod).toMatch(KOD_RE);
  expect((await svc("/api/tg/service/pair-consume", { telegram_user_id: TGID, code: kod })).status).toBe(200);
  await expect(kart.getByText("● Bağlı")).toBeVisible({ timeout: 25000 }); // yoklama sonucu uygulandı
  await expect(kart.getByText(kod)).toHaveCount(0);                        // kod bellekten silindi
  await svc("/api/tg/service/unlink", { telegram_user_id: TGID });
});
