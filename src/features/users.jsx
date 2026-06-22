// ============================================================
// Kullanıcı Yönetimi (yalnızca admin)
// ============================================================
import { useState } from "react";
import { C, pageTitle, inputStyle, rowStyle } from "../lib/constants.js";
import { storage } from "../lib/storage.js";
import { Card, Btn, DelBtn, Field } from "../components/ui.jsx";

export function Kullanicilar({ users, onChange, bildir, mevcut }) {
  const [yeni, setYeni] = useState({ username: "", sifre: "", ad: "", rol: "kullanici" });
  function ekle() {
    if (!yeni.username || !yeni.sifre) {
      bildir("Kullanıcı adı ve şifre gerekli", "err");
      return;
    }
    if (users.some((u) => u.username === yeni.username)) {
      bildir("Bu kullanıcı adı var", "err");
      return;
    }
    onChange([...users, { ...yeni }]);
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
  return (
    <div>
      <h2 style={pageTitle}>Kullanıcı Yönetimi</h2>
      <p style={{ color: C.dimmer, fontSize: "0.85rem", margin: "0 0 1.25rem" }}>Her kullanıcının verisi ayrıdır.</p>
      <Card style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: C.dim, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Yeni Kullanıcı</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <Field label="Ad Soyad" value={yeni.ad} onChange={(v) => setYeni((y) => ({ ...y, ad: v }))} />
          <Field label="Kullanıcı Adı" value={yeni.username} onChange={(v) => setYeni((y) => ({ ...y, username: v }))} />
          <Field label="Şifre" value={yeni.sifre} onChange={(v) => setYeni((y) => ({ ...y, sifre: v }))} />
          <Field label="Rol" value={yeni.rol} onChange={(v) => setYeni((y) => ({ ...y, rol: v }))} options={[{ id: "kullanici", label: "Kullanıcı" }, { id: "admin", label: "Yönetici" }]} />
        </div>
        <Btn onClick={ekle}>+ Kullanıcı Ekle</Btn>
      </Card>
      <Card>
        <h3 style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: C.dim, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Kullanıcılar ({users.length})</h3>
        {users.map((u) => (
          <div key={u.username} style={rowStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: u.rol === "admin" ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "#1E2130", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
                {(u.ad || u.username)[0]?.toUpperCase()}
              </div>
              <div>
                <p style={{ margin: "0 0 0.15rem", fontWeight: 600, fontSize: "0.88rem" }}>
                  {u.ad || u.username} {u.username === mevcut.username && <span style={{ color: C.indigoL, fontSize: "0.7rem" }}>(siz)</span>}
                </p>
                <p style={{ margin: 0, color: C.dimmer, fontSize: "0.72rem" }}>@{u.username}</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <select value={u.rol} onChange={(e) => rolDegis(u.username, e.target.value)} disabled={u.username === mevcut.username} style={{ ...inputStyle, width: "auto", padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}>
                <option value="kullanici">Kullanıcı</option>
                <option value="admin">Yönetici</option>
              </select>
              {u.username !== mevcut.username && <DelBtn onClick={() => sil(u.username)} />}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
