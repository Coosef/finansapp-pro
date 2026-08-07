// ============================================================
// Kullanıcı Yönetimi (yalnızca admin) — Zümrüt & Altın
// ============================================================
import { useState } from "react";
import { V, F } from "../lib/constants.js";
import { storage } from "../lib/storage.js";
import { sifreHashle } from "../lib/kripto.js";
import { Field, Btn, DelBtn } from "../components/ui.jsx";

export function Kullanicilar({ users, onChange, bildir, mevcut }) {
  const [yeni, setYeni] = useState({ username: "", sifre: "", ad: "", rol: "kullanici" });
  async function ekle() {
    if (!yeni.username || !yeni.sifre) {
      bildir("Kullanıcı adı ve şifre gerekli", "err");
      return;
    }
    if (users.some((u) => u.username === yeni.username)) {
      bildir("Bu kullanıcı adı var", "err");
      return;
    }
    const sifre = await sifreHashle(yeni.sifre); // düz-metin saklama
    onChange([...users, { ...yeni, sifre }]);
    setYeni({ username: "", sifre: "", ad: "", rol: "kullanici" });
    bildir("Kullanıcı eklendi");
  }
  function sil(username) {
    if (username === mevcut.username) {
      bildir("Kendinizi silemezsiniz", "err");
      return;
    }
    onChange(users.filter((u) => u.username !== username));
    storage.delete(`findata:${username}`).catch(() => {});
    bildir("Kullanıcı silindi");
  }
  function rolDegis(username, rol) {
    onChange(users.map((u) => (u.username === username ? { ...u, rol } : u)));
  }

  const rolEtiket = (rol) => (rol === "admin" ? "Yönetici" : "Kullanıcı");
  const rozet = (rol) => ({
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.03em",
    padding: "3px 8px",
    borderRadius: 99,
    whiteSpace: "nowrap",
    background: rol === "admin" ? V.emerald : V.track,
    color: rol === "admin" ? V.cream : V.ink2,
    border: rol === "admin" ? "none" : `1px solid ${V.border}`,
  });

  return (
    <div>
      <p style={{ color: V.ink3, fontSize: "12.5px", margin: "0 0 14px", lineHeight: 1.5 }}>
        Her kullanıcının verisi ayrıdır. Yalnızca yöneticiler kullanıcı ekleyip kaldırabilir.
      </p>

      {users.map((u) => (
        <div
          key={u.username}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: `1px solid ${V.line}`,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              flex: "none",
              background: u.rol === "admin" ? V.emerald : V.accent,
              color: u.rol === "admin" ? V.cream : V.emerald,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {(u.ad || u.username)[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13.5px", color: V.ink, fontWeight: 600 }}>
              {u.ad || u.username}{" "}
              {u.username === mevcut.username && (
                <span style={{ color: V.ink3, fontSize: "11px", fontWeight: 500 }}>(siz)</span>
              )}
            </div>
            <div style={{ fontSize: "11.5px", color: V.ink3 }}>@{u.username}</div>
          </div>
          <select
            value={u.rol === "admin" ? "admin" : "kullanici"}
            onChange={(e) => rolDegis(u.username, e.target.value)}
            disabled={u.username === mevcut.username}
            style={{
              padding: "6px 8px",
              fontSize: "12px",
              fontFamily: F,
              background: V.card2,
              border: `1px solid ${V.border}`,
              borderRadius: 8,
              color: V.ink,
              outline: "none",
              cursor: u.username === mevcut.username ? "not-allowed" : "pointer",
            }}
          >
            <option value="kullanici">Kullanıcı</option>
            <option value="admin">Yönetici</option>
          </select>
          <span style={rozet(u.rol)}>{rolEtiket(u.rol)}</span>
          {u.username !== mevcut.username ? (
            <DelBtn onClick={() => sil(u.username)} />
          ) : (
            <span style={{ width: 24, flex: "none" }} />
          )}
        </div>
      ))}

      <div
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: `1px solid ${V.line}`,
        }}
      >
        <div style={{ fontSize: "12.5px", color: V.ink2, marginBottom: 10, fontWeight: 600 }}>Yeni Kullanıcı</div>
        <div className="fa-grid-2">
          <Field label="Ad Soyad" value={yeni.ad} onChange={(v) => setYeni((y) => ({ ...y, ad: v }))} />
          <Field label="Kullanıcı Adı" value={yeni.username} onChange={(v) => setYeni((y) => ({ ...y, username: v }))} mono />
          <Field label="Şifre" type="password" value={yeni.sifre} onChange={(v) => setYeni((y) => ({ ...y, sifre: v }))} mono />
          <Field
            label="Rol"
            value={yeni.rol}
            onChange={(v) => setYeni((y) => ({ ...y, rol: v }))}
            options={[{ id: "kullanici", label: "Kullanıcı" }, { id: "admin", label: "Yönetici" }]}
          />
        </div>
        <Btn onClick={ekle}>+ Kullanıcı Ekle</Btn>
      </div>
    </div>
  );
}
