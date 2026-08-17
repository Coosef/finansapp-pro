// E2E yardımcıları — SENTETİK/deterministik veri (gerçek kişisel/prod verisi YOK).
// PB API ile fixture user + findata reset; localStorage session seed (login bypass'ı
// yalnız hız/izolasyon için; senaryo A gerçek login UI'ını test eder).
export const PB = { base: "http://localhost:8090", email: "e2e@finansapp.test", password: "e2epassword123" };

export const BASE_FINDATA = {
  gelirler: [{ id: 1, baslik: "Maaş", miktar: 50000, kategori: "Maaş", tarih: "2026-08-01", kaynak: "elle" }],
  giderler: [],
  abonelikler: [],
  hesaplar: [{ id: "h1", ad: "Banka", son4: "1234" }],
  kategoriler: { gelir: ["Maaş"], gider: ["Market", "Ulaşım"] },
  kisiler: [],
  ayarlar: { kuruldu: true }, // onboarding'i deterministik olarak atla (App.jsx: ayarlar.kuruldu)
};

export async function pbAuth() {
  const r = await fetch(PB.base + "/api/collections/users/auth-with-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB.email, password: PB.password }),
  });
  if (!r.ok) throw new Error("E2E pbAuth başarısız: " + r.status);
  const d = await r.json();
  return { token: d.token, userId: d.record.id };
}

// Her testin başında deterministik state: fixture user'ın findata'sını sıfırla.
export async function setFindata(findata) {
  const { token, userId } = await pbAuth();
  const r = await fetch(PB.base + `/api/collections/users/records/${userId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ data: findata }),
  });
  if (!r.ok) throw new Error("E2E setFindata başarısız: " + r.status);
  return { token, userId };
}

// findata'yı PB'den oku (browser davranışını doğrulamak için ek kanıt).
export async function getFindata() {
  const { token, userId } = await pbAuth();
  const r = await fetch(PB.base + `/api/collections/users/records/${userId}`, { headers: { Authorization: token } });
  const d = await r.json();
  return d.data || {};
}

// Login UI'ını atlayıp oturumu localStorage'a enjekte et (B–L için hız + izolasyon).
export async function seedSession(page, findata) {
  const { token, userId } = await setFindata(findata);
  await page.addInitScript(([t, u, e]) => {
    localStorage.setItem("finansapp:sync", JSON.stringify({ url: "", token: t, userId: u, email: e }));
  }, [token, userId, PB.email]);
}
