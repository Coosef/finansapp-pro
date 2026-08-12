// ============================================================
// Hesaplar & Cüzdanlar — Zümrüt & Altın tasarımı
// ============================================================
import { useState } from "react";
import { V, F, SERIF, MONO, HESAP_TIP } from "../lib/constants.js";
import { uid, TL, bugun, sayiCevir } from "../lib/format.js";
import { transferUygula, transferleriEslestir } from "../lib/finance.js";
import { haneAdaylari, haneYenidenSinifla } from "../lib/kisi.js";
import { Card, Btn, Field, Modal, Toggle, DelBtn, Bos } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

// ---- Hesaplar arası akış diyagramı (SVG Sankey: sol kaynak → sağ hedef) ----
// Ok başları sabit boyut (markerUnits=userSpaceOnUse) → çizgi kalınlığıyla
// büyümez. Tutarlar diyagramda değil, alttaki legend'de (çakışmayı önler).
function AkisDiyagram({ ozet }) {
  if (!ozet?.length) return null;
  const kisalt = (s) => (s.length > 16 ? s.slice(0, 15) + "…" : s);
  // En büyük 10 akışı çiz (kalabalığı önle; tamamı alttaki listede zaten var).
  const flows = [...ozet].sort((a, b) => b.toplam - a.toplam).slice(0, 10);
  const kirpildi = ozet.length - flows.length;
  const sources = [...new Set(flows.map((f) => f.fromAd))];
  const srcIdx = Object.fromEntries(sources.map((s, i) => [s, i]));
  // Hedefleri kaynak konumuna göre (baryzentr) sırala → çaprazlamaları azalt.
  const targets = [...new Set(flows.map((f) => f.toAd))].sort((a, b) => {
    const bary = (t) => { const r = flows.filter((f) => f.toAd === t); const w = r.reduce((s, f) => s + f.toplam, 0) || 1; return r.reduce((s, f) => s + srcIdx[f.fromAd] * f.toplam, 0) / w; };
    return bary(a) - bary(b);
  });
  const boxW = 150, boxH = 40, rowH = 58, W = 480;
  const n = Math.max(sources.length, targets.length, 1);
  const H = n * rowH + 12;
  const leftX = 4, rightX = W - boxW - 4;
  const colY = (arr, name) => {
    const cnt = arr.length, i = arr.indexOf(name);
    if (cnt === 1) return H / 2;
    const top = boxH / 2 + 6, bot = H - boxH / 2 - 6;
    return top + (bot - top) * (i / (cnt - 1));
  };
  const maxAmt = Math.max(...flows.map((f) => f.toplam), 1);
  const sw = (amt) => 2 + (amt / maxAmt) * 9; // 2..11
  const dugum = (name, x, arr, key) => {
    const y = colY(arr, name);
    return (
      <g key={key}>
        <rect x={x} y={y - boxH / 2} width={boxW} height={boxH} rx="10" fill={V.card2} stroke={V.border2} />
        <text x={x + 12} y={y + 4.5} fontSize="12" fill={V.ink} fontWeight="600">{kisalt(name)}</text>
      </g>
    );
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {/* Yükseklik içeriğe göre büyür (eski maxHeight:260 kırpması düğümleri üst üste bindiriyordu) */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", height: "auto" }}>
        <defs>
          <marker id="akisOk" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" refX="7.5" refY="4.5" orient="auto">
            <path d="M1,1 L8,4.5 L1,8 Z" fill={V.emerald2} />
          </marker>
        </defs>
        {flows.map((f, i) => {
          const y1 = colY(sources, f.fromAd), y2 = colY(targets, f.toAd);
          const x1 = leftX + boxW, x2 = rightX - 1, xm = (x1 + x2) / 2;
          return (
            <path key={i} d={`M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2 - 6},${y2}`} fill="none" stroke={V.emerald2} strokeOpacity="0.3" strokeWidth={sw(f.toplam)} strokeLinecap="round" markerEnd="url(#akisOk)">
              <title>{f.fromAd} → {f.toAd}: {TL(f.toplam)}</title>
            </path>
          );
        })}
        {sources.map((s) => dugum(s, leftX, sources, "s" + s))}
        {targets.map((t) => dugum(t, rightX, targets, "t" + t))}
      </svg>
      {kirpildi > 0 && <p style={{ margin: "2px 0 0", fontSize: "11px", color: V.ink3, textAlign: "center" }}>+{kirpildi} akış daha (aşağıdaki listede)</p>}
    </div>
  );
}

// ---- Hesap ekle/düzenle modalı (yerel form durumu) ----
function HesapModal({ baslangic, onKaydet, onClose }) {
  const [ad, setAd] = useState(baslangic?.ad || "");
  const [tip, setTip] = useState(baslangic?.tip || "banka");
  const [bakiye, setBakiye] = useState(baslangic != null ? String(baslangic.bakiye ?? "") : "");
  const duzenle = !!baslangic;

  function kaydet() {
    onKaydet({ ad, tip, bakiye });
  }

  return (
    <Modal title={duzenle ? "Hesap Düzenle" : "Hesap Ekle"} onClose={onClose}>
      <Field label="Hesap adı" value={ad} onChange={setAd} placeholder="Örn: Ziraat Vadesiz" />
      <label style={{ display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Tür</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
        {HESAP_TIP.map((t) => {
          const on = t.id === tip;
          return (
            <button
              key={t.id}
              onClick={() => setTip(t.id)}
              className="fa-btn"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 13px", borderRadius: "9px",
                border: `1px solid ${on ? "transparent" : V.border2}`, cursor: "pointer", fontFamily: F, fontWeight: 600, fontSize: "13px",
                background: on ? V.emerald : V.card, color: on ? V.cream : V.ink,
              }}
            >
              <Icon d={t.ipath} size={15} />
              {t.label}
            </button>
          );
        })}
      </div>
      <Field label={tip === "kart" ? "Borç (₺)" : "Bakiye (₺)"} type="number" value={bakiye} onChange={setBakiye} mono />
      <Btn onClick={kaydet} style={{ width: "100%", padding: "13px", marginTop: "0.2rem" }}>
        {duzenle ? "Kaydet" : "Hesap Oluştur"}
      </Btn>
    </Modal>
  );
}

export function Hesaplar({ findata, setFindata, bildir }) {
  // duzenle: null = kapalı, "yeni" = ekleme, {hesap} = düzenleme
  const [duzenle, setDuzenle] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const hesaplar = findata.hesaplar || [];
  const varlik = hesaplar.filter((h) => h.tip !== "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const borc = hesaplar.filter((h) => h.tip === "kart").reduce((s, h) => s + (+h.bakiye || 0), 0);
  const net = varlik - borc;
  const akis = transferleriEslestir(findata); // hesaplar arası transfer korelasyonu
  const [acikYol, setAcikYol] = useState(null); // akış listesinde açık hesap-çifti
  const [kisiDuzenle, setKisiDuzenle] = useState(null); // hane kişisi ekle/düzenle modalı
  const [kisiAkis, setKisiAkis] = useState(null); // bir kişinin para akışı detayı modalı
  // Bir kişinin para akışı: yeni model (kisiId'li gelir/gider — ham yön: gider=giden,
  // gelir=gelen) + eski transferAkis bacakları (geriye dönük uyum). İşaretli miktar.
  function kisiAkisAc(k) {
    const id = String(k.id);
    const kayittan = (arr, yon) =>
      (arr || []).filter((x) => String(x.kisiId) === id)
        .map((x) => ({ tarih: x.tarih, miktar: yon === "gider" ? -Math.abs(+x.miktar || 0) : Math.abs(+x.miktar || 0), aciklama: x.baslik }));
    const legler = (findata.transferAkis || []).filter((l) => String(l.kisiId) === id)
      .map((l) => ({ tarih: l.tarih, miktar: +l.miktar || 0, aciklama: l.aciklama }));
    const hepsi = [...kayittan(findata.giderler, "gider"), ...kayittan(findata.gelirler, "gelir"), ...legler]
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
    setKisiAkis({ ad: k.ad, legler: hepsi });
  }

  // ---- Hane kişileri (karşı hesaplar) ----
  const kisiler = findata.kisiler || [];
  const adaylar = haneAdaylari(findata); // veriden aday karşı taraflar
  // Kişi bazlı nakit akışı — YALNIZ ham para yönünden (gider=gönderilen, gelir=gelen).
  // Bu bir nakit akışıdır, finansal anlam (harcama/hediye/borç) DEĞİL; KPI'a girmez.
  const kisiFlow = {};
  const akisEkle = (kisiId, gonderilen, gelen) => {
    const f = (kisiFlow[kisiId] = kisiFlow[kisiId] || { gonderilen: 0, gelen: 0, adet: 0 });
    f.gonderilen += gonderilen; f.gelen += gelen; f.adet++;
  };
  (findata.giderler || []).filter((g) => g.kisiId).forEach((g) => akisEkle(g.kisiId, Math.abs(+g.miktar || 0), 0));
  (findata.gelirler || []).filter((g) => g.kisiId).forEach((g) => akisEkle(g.kisiId, 0, Math.abs(+g.miktar || 0)));
  // Legacy: eski transferAkis bacakları (kisiId ile) — geriye dönük uyum
  (findata.transferAkis || []).filter((l) => l.kisiId).forEach((l) => {
    if ((+l.miktar || 0) < 0) akisEkle(l.kisiId, Math.abs(+l.miktar || 0), 0);
    else akisEkle(l.kisiId, 0, Math.abs(+l.miktar || 0));
  });

  function kisiAc(k) {
    setKisiDuzenle(k?.id
      ? { id: k.id, ad: k.ad, hane: k.hane !== false, anahtarlar: (k.anahtarlar || []).join(", "), iban: k.iban || "", son4: k.son4 || "", not: k.not || "" }
      : { ad: k?.ad || "", hane: true, anahtarlar: k?.anahtarlar || "", iban: "", son4: "", not: "" });
  }
  function kisiKaydet() {
    const ad = (kisiDuzenle.ad || "").trim();
    if (!ad) { bildir("Bir etiket/ad gir (ör. Kız arkadaşım)", "err"); return; }
    const anahtarlar = String(kisiDuzenle.anahtarlar || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!anahtarlar.length && !kisiDuzenle.iban && !kisiDuzenle.son4) { bildir("En az bir tanıma kelimesi ya da IBAN/son4 gir", "err"); return; }
    const rec = { ad, hane: kisiDuzenle.hane !== false, anahtarlar, iban: kisiDuzenle.iban || undefined, son4: (String(kisiDuzenle.son4 || "").replace(/\D/g, "").slice(-4)) || undefined, not: kisiDuzenle.not || undefined };
    setFindata((d) => {
      const list = [...(d.kisiler || [])];
      if (kisiDuzenle.id) { const i = list.findIndex((x) => x.id === kisiDuzenle.id); if (i >= 0) list[i] = { ...list[i], ...rec }; }
      else list.push({ id: uid(), ...rec });
      return { ...d, kisiler: list };
    });
    bildir(kisiDuzenle.id ? "Kişi güncellendi" : `${ad} eklendi — ekstre yüklerken ona giden/gelen para incelemeye alınır`);
    setKisiDuzenle(null);
  }
  function kisiSil(id) {
    setFindata((d) => ({
      ...d,
      kisiler: (d.kisiler || []).filter((k) => k.id !== id),
      // Bu kişiye bağlı transfer bacaklarından kisiId'yi kaldır (yetim kalmasın)
      transferAkis: (d.transferAkis || []).map((l) => (String(l.kisiId) === String(id) ? (({ kisiId, ...rest }) => rest)(l) : l)),
    }));
    bildir("Kişi silindi");
    setKisiDuzenle(null);
  }
  function haneSinifla() {
    const onceki = findata;
    const { data, tasindi } = haneYenidenSinifla(findata);
    if (!tasindi) { bildir("Etiketlenecek işlem yok — kişilerin tanıma kelimelerini kontrol et.", "ok"); return; }
    setFindata(() => data);
    bildir(`${tasindi} işlem incelemeye alındı — İşlemler'de finansal türünü seç (şimdilik KPI'a girmez)`, "ok", { label: "↩ Geri al", onClick: () => setFindata(() => onceki) });
  }

  function modalKaydet(form) {
    if (!form.ad.trim()) {
      bildir("Hesap adı gerekli", "err");
      return;
    }
    const bakiye = sayiCevir(form.bakiye);
    if (duzenle && duzenle !== "yeni") {
      const id = duzenle.id;
      setFindata((d) => ({ ...d, hesaplar: d.hesaplar.map((h) => (h.id === id ? { ...h, ad: form.ad.trim(), tip: form.tip, bakiye } : h)) }));
      bildir("Hesap güncellendi");
    } else {
      setFindata((d) => ({ ...d, hesaplar: [...(d.hesaplar || []), { id: uid(), ad: form.ad.trim(), tip: form.tip, bakiye }] }));
      bildir("Hesap eklendi");
    }
    setDuzenle(null);
  }

  function sil(h) {
    setFindata((d) => ({ ...d, hesaplar: (d.hesaplar || []).filter((x) => x.id !== h.id) }));
    bildir("Hesap silindi", "ok", {
      label: "↩ Geri al",
      onClick: () => setFindata((d) => ({ ...d, hesaplar: [...(d.hesaplar || []), h] })),
    });
  }

  function transferAc() {
    setTransfer({ kaynak: String(hesaplar[0]?.id || ""), hedef: String(hesaplar[1]?.id || ""), miktar: "" });
  }
  function transferYap() {
    const m = sayiCevir(transfer.miktar);
    if (!transfer.kaynak || !transfer.hedef || transfer.kaynak === transfer.hedef) {
      bildir("Farklı iki hesap seç", "err");
      return;
    }
    if (!m || m <= 0) {
      bildir("Geçerli tutar gir", "err");
      return;
    }
    const kayit = { id: uid(), kaynakId: transfer.kaynak, hedefId: transfer.hedef, miktar: m, tarih: bugun() };
    setFindata((d) => ({ ...transferUygula(d, transfer.kaynak, transfer.hedef, m), transferler: [...(d.transferler || []), kayit] }));
    setTransfer(null);
    bildir("Transfer yapıldı");
  }
  function transferSil(tr) {
    setFindata((d) => ({ ...transferUygula(d, tr.hedefId, tr.kaynakId, tr.miktar), transferler: (d.transferler || []).filter((x) => x.id !== tr.id) }));
    bildir("Transfer geri alındı", "ok", {
      label: "↩ Tekrar uygula",
      onClick: () => setFindata((d) => ({ ...transferUygula(d, tr.kaynakId, tr.hedefId, tr.miktar), transferler: [...(d.transferler || []), tr] })),
    });
  }

  return (
    <div>
      {/* Başlık + toplamlar + butonlar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 className="serif" style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 600, color: V.ink, fontFamily: SERIF }}>Hesaplar & Cüzdanlar</h2>
          <p style={{ margin: 0, fontSize: "12.5px", color: V.ink3 }}>
            Varlık <b className="num" style={{ color: V.pos, fontFamily: MONO }}>{TL(varlik)}</b>
            <span style={{ color: V.border2, margin: "0 7px" }}>·</span>
            Kart borcu <b className="num" style={{ color: V.neg, fontFamily: MONO }}>{TL(borc)}</b>
            <span style={{ color: V.border2, margin: "0 7px" }}>·</span>
            Net <b className="num" style={{ color: net >= 0 ? V.pos : V.neg, fontFamily: MONO }}>{TL(net)}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {hesaplar.length >= 2 && <Btn variant="ghost" onClick={transferAc}>⇄ Transfer</Btn>}
          <Btn onClick={() => setDuzenle("yeni")}>+ Hesap</Btn>
        </div>
      </div>

      {/* Boş durum */}
      {!hesaplar.length && (
        <Bos icon="wallet" baslik="Hesap yok" mesaj="Nakit, banka, kredi kartı veya birikim hesabı ekle." />
      )}

      {/* Hesap kartları */}
      {hesaplar.length > 0 && (
        <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "14px" }}>
          {hesaplar.map((h) => {
            const ht = HESAP_TIP.find((t) => t.id === h.tip) || HESAP_TIP[1];
            const kart = h.tip === "kart";
            return (
              <Card
                key={h.id}
                style={{ display: "flex", alignItems: "center", gap: "15px", cursor: "pointer" }}
              >
                <div
                  onClick={() => setDuzenle(h)}
                  style={{ display: "flex", alignItems: "center", gap: "15px", flex: 1, minWidth: 0 }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${ht.renk} 14%, transparent)`, color: ht.renk }}>
                    <Icon d={ht.ipath} size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.ad}</div>
                    <div style={{ fontSize: "11.5px", color: V.ink3 }}>{ht.label}</div>
                  </div>
                  <div className="num" style={{ fontSize: "18px", fontWeight: 600, color: kart ? V.neg : V.ink, fontFamily: MONO, whiteSpace: "nowrap" }}>{TL(h.bakiye)}</div>
                </div>
                <DelBtn onClick={() => sil(h)} />
              </Card>
            );
          })}
        </div>
      )}

      {/* Hane Hesapları — kişi bazlı akış, hesap kartı gibi (tıkla → hareketler) */}
      {kisiler.filter((k) => k.hane).length > 0 && (
        <div style={{ marginTop: "14px" }}>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Hane Hesapları</h3>
          <div className="fa-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "14px" }}>
            {kisiler.filter((k) => k.hane).map((k) => {
              const f = kisiFlow[k.id] || { gonderilen: 0, gelen: 0, adet: 0 };
              const net = f.gelen - f.gonderilen; // + sana net gelmiş, − sen net göndermişsin
              return (
                <Card key={k.id} onClick={() => kisiAkisAc(k)} style={{ display: "flex", alignItems: "center", gap: "15px", cursor: "pointer" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
                    <Icon d="users" size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.ad}</div>
                    <div style={{ fontSize: "11.5px", color: V.ink3 }}>
                      {f.adet > 0 ? <>↑{TL(f.gonderilen)} · ↓{TL(f.gelen)} · {f.adet} hareket</> : "Henüz hareket yok"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="num" style={{ fontSize: "15px", fontWeight: 600, color: net >= 0 ? V.pos : V.neg, fontFamily: MONO, whiteSpace: "nowrap" }}>{net >= 0 ? "+" : "−"}{TL(Math.abs(net))}</div>
                    <div style={{ fontSize: "10px", color: V.ink3 }}>{net >= 0 ? "net gelen" : "net gönderilen"}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Hane Kişileri & Karşı Hesaplar */}
      <Card style={{ marginTop: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "0.6rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d="users" size={16} stroke={V.accent} />
            <h3 style={{ margin: 0, fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Hane Kişileri & Karşı Hesaplar</h3>
          </div>
          <Btn variant="gold" onClick={() => kisiAc(null)} style={{ padding: "7px 12px", fontSize: "12.5px" }}><Icon d="plus" size={13} /> Kişi</Btn>
        </div>
        <p style={{ margin: "0 0 0.9rem", fontSize: "12px", color: V.ink3, lineHeight: 1.6 }}>
          Kendi ve <b>hanendeki kişilerin</b> hesabına giden/gelen para otomatik harcama/gelir sayılmaz — <b>incelemeye alınır</b>. Bir kişiyi ekle (ör. <i>"Kız arkadaşım"</i>); ham para akışı burada görünür, finansal anlamını (harcama / hediye / borç / transfer) İşlemler'de sen seçersin.
        </p>

        {/* Veriden öneriler */}
        {adaylar.length > 0 && (
          <div style={{ marginBottom: "0.9rem", padding: "9px 11px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: "11.5px", color: V.ink3, marginBottom: 7 }}>Verinde sık transfer yaptığın karşı taraflar — birine tıkla, etiketle:</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {adaylar.slice(0, 6).map((a, i) => (
                <button key={i} onClick={() => kisiAc({ ad: "", anahtarlar: a.anahtar })} className="fa-btn"
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${V.border2}`, background: V.card, color: V.ink2, fontSize: 12, cursor: "pointer", fontFamily: F }}>
                  <b style={{ color: V.ink, textTransform: "capitalize" }}>{a.anahtar}</b> · {TL(a.toplam)} · {a.adet}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Kişi listesi */}
        {!kisiler.length && <p style={{ margin: "0 0 0.4rem", fontSize: "12.5px", color: V.ink3 }}>Henüz hane kişisi yok.</p>}
        {kisiler.map((k) => {
          const f = kisiFlow[k.id] || { gonderilen: 0, gelen: 0, adet: 0 };
          return (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 10, marginBottom: 8 }}>
              <div onClick={() => kisiAc(k)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, display: "flex", alignItems: "center", gap: 6 }}>
                  {k.ad}
                  {k.hane
                    ? <span style={{ background: "var(--chip-green)", color: V.pos, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5 }}>HANE</span>
                    : <span style={{ background: V.track, color: V.ink3, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 5 }}>DIŞ</span>}
                  <Icon d="edit" size={12} stroke={V.ink3} />
                </div>
                <div style={{ fontSize: 11.5, color: V.ink3, marginTop: 2 }}>
                  {f.adet > 0
                    ? <>Gönderdiğin <b className="num" style={{ color: V.neg }}>{TL(f.gonderilen)}</b> · Gelen <b className="num" style={{ color: V.pos }}>{TL(f.gelen)}</b> · {f.adet} hareket</>
                    : (k.anahtarlar || []).length ? `Tanıma: ${(k.anahtarlar || []).join(", ")}` : k.iban ? "IBAN ile tanınır" : "Henüz eşleşen hareket yok"}
                </div>
              </div>
              <DelBtn onClick={() => kisiSil(k.id)} />
            </div>
          );
        })}

        {kisiler.some((k) => k.hane) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <Btn variant="ghost" onClick={haneSinifla} style={{ padding: "8px 13px", fontSize: 12.5 }}>↻ Mevcut işlemleri yeniden sınıfla</Btn>
            <span style={{ fontSize: 11, color: V.ink3 }}>Geçmiş gelir/giderlerden hane kişilerine gidenleri incelemeye alır — türünü İşlemler'de seçersin (geri alınabilir)</span>
          </div>
        )}
      </Card>

      {/* Hesaplar arası para akışı (korelasyon haritası) */}
      {(akis.ozet.length > 0 || akis.eslesmeyen.length > 0) && (
        <Card style={{ marginTop: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: "0.85rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon d="repeat" size={16} stroke={V.accent} />
              <h3 style={{ margin: 0, fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Hesaplar Arası Para Akışı</h3>
            </div>
            <span style={{ fontSize: "11px", color: V.ink3 }}>{akis.eslesen.length} eşleşen transfer</span>
          </div>

          {/* Akış diyagramı (Sankey) */}
          <AkisDiyagram ozet={akis.ozet} />

          {/* Korelasyon özeti: hesap çiftleri — tıkla → tek tek transferler açılır */}
          {akis.ozet.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {akis.ozet.map((p) => {
                const yol = `${p.fromAd}→${p.toAd}`;
                const acik = acikYol === yol;
                const detay = acik ? akis.eslesen.filter((e) => e.fromAd === p.fromAd && e.toAd === p.toAd) : [];
                return (
                  <div key={yol} style={{ background: V.card2, border: `1px solid ${acik ? V.border2 : V.border}`, borderRadius: "10px", overflow: "hidden" }}>
                    <div onClick={() => setAcikYol(acik ? null : yol)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 12px", cursor: "pointer" }}>
                      <span style={{ fontSize: "13px", color: V.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 11, color: V.ink3, transform: acik ? "rotate(90deg)" : "none", transition: "transform .15s", marginRight: 3 }}>›</span>
                        <b>{p.fromAd}</b> <span style={{ color: V.accent }}>→</span> <b>{p.toAd}</b>
                        <span style={{ color: V.ink3, fontSize: "11.5px" }}> · {p.adet} transfer</span>
                      </span>
                      <span className="num" style={{ fontSize: "14px", fontWeight: 600, color: V.ink, fontFamily: MONO, whiteSpace: "nowrap" }}>{TL(p.toplam)}</span>
                    </div>
                    {acik && (
                      <div style={{ borderTop: `1px solid ${V.line}`, padding: "3px 12px 7px 27px" }}>
                        {detay.map((e, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: i < detay.length - 1 ? `1px solid ${V.line}` : "none", fontSize: "12px" }}>
                            <span style={{ color: V.ink2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <span style={{ color: V.ink3 }}>{e.tarih}</span>
                              {e.aciklama ? ` · ${e.aciklama}` : e.kaynak === "manuel" ? " · elle transfer" : ""}
                            </span>
                            <span className="num" style={{ fontWeight: 600, color: V.ink, fontFamily: MONO, whiteSpace: "nowrap" }}>{TL(e.miktar)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {akis.eslesmeyen.length > 0 && (
            <p style={{ margin: "0.85rem 0 0", fontSize: "11.5px", color: V.ink3, lineHeight: 1.6 }}>
              ⇆ {akis.eslesmeyen.length} eşleşmeyen hareket — karşı hesabın ekstresi yok ya da dışarıya/dışarıdan (ör. başka kişiye gönderim). Bunlar gelir/gider olarak ayrı işlenir.
            </p>
          )}
        </Card>
      )}

      {/* Akış yok ama hesap var → yol gösteren ipucu */}
      {akis.ozet.length === 0 && akis.eslesmeyen.length === 0 && hesaplar.length >= 2 && (
        <Card style={{ marginTop: "14px", background: V.card2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.5rem" }}>
            <Icon d="repeat" size={16} stroke={V.ink3} />
            <h3 style={{ margin: 0, fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Hesaplar Arası Para Akışı</h3>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", color: V.ink3, lineHeight: 1.6 }}>
            Burada hesapların arası transferler eşleşip <b>akış diyagramı</b> olarak görünür. Doldurmak için
            <b style={{ color: V.ink2 }}> Veri &amp; Yedek → Ekstre Yükle</b> ile banka ekstrelerini (DenizBank, Enpara hesapları) <b>bir kez yeniden yükle</b> — transfer bilgisi eski içe aktarımlarda saklanmamıştı. Çift sayım olmaz.
          </p>
        </Card>
      )}

      {/* Son transferler */}
      {(findata.transferler || []).length > 0 && (
        <Card style={{ marginTop: "14px" }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Son Transferler</h3>
          {findata.transferler.slice().reverse().slice(0, 8).map((tr) => {
            const k = hesaplar.find((h) => String(h.id) === String(tr.kaynakId));
            const hd = hesaplar.find((h) => String(h.id) === String(tr.hedefId));
            return (
              <div key={tr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${V.line}`, fontSize: "13px" }}>
                <span style={{ color: V.ink2 }}>
                  {k?.ad || "?"} <span style={{ color: V.ink3 }}>→</span> {hd?.ad || "?"}
                  <span style={{ color: V.ink3 }}> · {tr.tarih}</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span className="num" style={{ fontWeight: 600, color: V.ink, fontFamily: MONO }}>{TL(tr.miktar)}</span>
                  <DelBtn onClick={() => transferSil(tr)} title="Transferi geri al" />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Hesap ekle/düzenle modalı */}
      {duzenle && (
        <HesapModal
          baslangic={duzenle === "yeni" ? null : duzenle}
          onKaydet={modalKaydet}
          onClose={() => setDuzenle(null)}
        />
      )}

      {/* Bir kişinin para akışı (hareket listesi) */}
      {kisiAkis && (
        <Modal title={`${kisiAkis.ad} — Para Akışı`} onClose={() => setKisiAkis(null)} maxWidth={460}>
          {!kisiAkis.legler.length ? (
            <Bos mesaj="Bu kişiyle henüz hareket yok. Ekstre yükleyince ya da 'Yeniden sınıfla' ile burada görünür." icon="repeat" />
          ) : (
            <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
              {kisiAkis.legler.map((l, i) => {
                const cikis = (+l.miktar || 0) < 0;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < kisiAkis.legler.length - 1 ? `1px solid ${V.line}` : "none" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: V.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cikis ? "Gönderdin" : "Sana geldi"}{l.aciklama ? ` · ${l.aciklama}` : ""}</div>
                      <div style={{ fontSize: 11, color: V.ink3 }}>{l.tarih}</div>
                    </div>
                    <div className="num" style={{ fontSize: 13.5, fontWeight: 600, fontFamily: MONO, color: cikis ? V.neg : V.pos, flexShrink: 0 }}>{cikis ? "−" : "+"}{TL(Math.abs(+l.miktar || 0))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Hane kişisi ekle/düzenle modalı */}
      {kisiDuzenle && (
        <Modal title={kisiDuzenle.id ? "Kişiyi Düzenle" : "Hane Kişisi Ekle"} onClose={() => setKisiDuzenle(null)} maxWidth={420}>
          <Field label="Etiket / Ad" value={kisiDuzenle.ad} onChange={(v) => setKisiDuzenle((k) => ({ ...k, ad: v }))} placeholder="Örn: Kız arkadaşım, Annem" />
          <label style={{ display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Tanıma kelimeleri (virgülle)</label>
          <input value={kisiDuzenle.anahtarlar} onChange={(e) => setKisiDuzenle((k) => ({ ...k, anahtarlar: e.target.value }))} placeholder="helin, ergüzel"
            style={{ width: "100%", padding: "11px 13px", marginBottom: 4, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 10, color: V.ink, fontSize: "13.5px", fontFamily: F, outline: "none", boxSizing: "border-box" }} />
          <p style={{ margin: "0 0 12px", fontSize: 11, color: V.ink3, lineHeight: 1.5 }}>Ekstre açıklamasında bu kelimeler (genelde kişinin adı) geçince o işlem bu kişiye ait sayılır.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1.6 }}><Field label="IBAN (opsiyonel)" value={kisiDuzenle.iban} onChange={(v) => setKisiDuzenle((k) => ({ ...k, iban: v }))} placeholder="TR.." /></div>
            <div style={{ flex: 1 }}><Field label="Son 4 hane" value={kisiDuzenle.son4} onChange={(v) => setKisiDuzenle((k) => ({ ...k, son4: v }))} placeholder="1234" /></div>
          </div>
          <Toggle label="Hane (transfer sayılsın)" sub="Kapalıysa dışarıya harcama olarak kalır" checked={kisiDuzenle.hane !== false} onChange={(v) => setKisiDuzenle((k) => ({ ...k, hane: v }))} />
          <div style={{ marginTop: 14 }}>
            <Field label="Not (opsiyonel)" value={kisiDuzenle.not} onChange={(v) => setKisiDuzenle((k) => ({ ...k, not: v }))} placeholder="Örn: ev kirası, harçlık…" />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <Btn onClick={kisiKaydet} style={{ flex: 1, padding: "13px" }}>{kisiDuzenle.id ? "Kaydet" : "Ekle"}</Btn>
            {kisiDuzenle.id && <Btn variant="danger" onClick={() => kisiSil(kisiDuzenle.id)} style={{ padding: "13px 16px" }}>Sil</Btn>}
          </div>
        </Modal>
      )}

      {/* Transfer modalı */}
      {transfer && (
        <Modal title="Hesaplar Arası Transfer" onClose={() => setTransfer(null)}>
          <Field label="Kaynak hesap" value={transfer.kaynak} onChange={(v) => setTransfer((t) => ({ ...t, kaynak: v }))} options={hesaplar.map((h) => ({ id: String(h.id), label: `${h.ad} (${TL(h.bakiye)})` }))} />
          <Field label="Hedef hesap" value={transfer.hedef} onChange={(v) => setTransfer((t) => ({ ...t, hedef: v }))} options={hesaplar.map((h) => ({ id: String(h.id), label: `${h.ad} (${TL(h.bakiye)})` }))} />
          <Field label="Tutar (₺)" type="number" value={transfer.miktar} onChange={(v) => setTransfer((t) => ({ ...t, miktar: v }))} mono />
          <p style={{ color: V.ink3, fontSize: "11.5px", margin: "0 0 14px" }}>Kredi kartına transfer borcu azaltır; karttan transfer borcu artırır.</p>
          <Btn onClick={transferYap} style={{ width: "100%", padding: "13px" }}>Transfer Et</Btn>
        </Modal>
      )}
    </div>
  );
}
