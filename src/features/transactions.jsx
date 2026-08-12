// ============================================================
// İşlemler — birleşik liste (gelir + gider + abonelik), Zümrüt & Altın
// Pill filtre + arama + satır düzenleme/silme; tek İşlem/Abonelik modalı
// ============================================================
import { useState, useEffect } from "react";
import { V, F, SERIF, MONO, AY_ADI, inputStyle } from "../lib/constants.js";
import { TL, sayiCevir } from "../lib/format.js";
import { tryeCevir, pbSembol, PB_SECENEK } from "../lib/parabirimi.js";
import { bekleyenInceleme, turSecenekleri, turEtkiIpucu, turEtiket } from "../lib/incele.js";
import { Icon } from "../components/icons.jsx";
import { Card, Btn, Modal, Field, Toggle, DelBtn, Bos } from "../components/ui.jsx";

// KPI etki ipucu rengi (turEtkiIpucu.tip → renk)
const ETKI_RENK = { gider: V.neg, gelir: V.pos, iade: V.pos, stopaj: V.neg, notr: V.ink3 };

// İncelenecek işlem kartı: ham kaydı bozmadan finansal anlam seçtirir.
// Ham başlık/tutar/yön/kişi gösterilir; her seçenek KPI etkisini canlı belirtir.
function InceleSatir({ rec, kisiAd, son, onSinifla }) {
  const cikis = rec._yon === "gider";
  const secenekler = turSecenekleri(rec._yon);
  return (
    <div style={{ padding: "13px 0", borderBottom: son ? "none" : `1px solid ${V.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: cikis ? V.chipRed : V.chipGreen, color: cikis ? V.neg : V.pos, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon d={cikis ? "arrowDown" : "arrowUp"} size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.baslik}</div>
          <div style={{ fontSize: 11.5, color: V.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[isoKisa(rec.tarih), cikis ? "giden" : "gelen", kisiAd || rec.incelemeNeden].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, color: cikis ? V.neg : V.pos, fontFamily: MONO, flexShrink: 0 }}>{cikis ? "−" : "+"}{TL(rec.miktar)}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 46 }}>
        {secenekler.map((s) => {
          const ip = turEtkiIpucu(s.tur, rec._yon);
          return (
            <button
              key={s.tur}
              onClick={() => onSinifla(rec, s.tur)}
              className="fa-btn"
              title={`${s.label} → ${ip.metin}`}
              style={{ border: `1px solid ${V.border2}`, borderRadius: 8, padding: "5px 9px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: F, background: V.card2, color: V.ink2, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
            >
              {s.label}
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ETKI_RENK[ip.tip], flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ISO tarihi "23 Haz" gibi kısa biçimde göster
const isoKisa = (iso) => {
  const [, m, d] = String(iso).split("-");
  return `${+d} ${AY_ADI[+m - 1]}`;
};

// Tip -> ikon dairesi + tutar rengi/işaret bilgileri
const TIP_STIL = {
  gelir: { bg: V.chipGreen, renk: V.pos, icon: "arrowUp", sign: "+", amtRenk: V.pos },
  gider: { bg: V.chipRed, renk: V.neg, icon: "arrowDown", sign: "−", amtRenk: V.neg },
  abonelik: { bg: V.chipGold, renk: V.gold, icon: "repeat", sign: "−", amtRenk: V.neg },
};

function IslemSatir({ t, hesapAd, son, onDuzenle, onSil }) {
  const s = TIP_STIL[t.tip] || TIP_STIL.gider;
  const tekrar = t.otomatik || t.tekrar || t.tip === "abonelik";
  const meta = [hesapAd, t.kategori, isoKisa(t.tarih)].filter(Boolean).join(" · ");
  return (
    <div
      onClick={() => onDuzenle(t.tip, t)}
      style={{
        display: "flex", alignItems: "center", gap: "13px",
        padding: "12px 0", borderBottom: son ? "none" : `1px solid ${V.line}`, cursor: "pointer",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: s.bg, color: s.renk, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon d={s.icon} size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 500, color: V.ink, display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.baslik}</span>
          {tekrar && (
            <span title="Her ay tekrarlanır" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "10px", color: V.gold, background: V.chipGold, padding: "1px 6px", borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>⟳ aylık</span>
          )}
          {t.kaynak === "ekstre" && (
            <span title="Ekstreden içe aktarıldı" style={{ fontSize: "9.5px", color: V.ink3, border: `1px solid ${V.border2}`, padding: "1px 5px", borderRadius: 5, fontWeight: 600, flexShrink: 0, letterSpacing: "0.03em" }}>EKSTRE</span>
          )}
          {t.tur === "needs_review" && (
            <span title="Finansal anlamı bekliyor — İncele filtresinde sınıfla" style={{ fontSize: "9.5px", color: V.accent, background: V.chipGold, border: `1px solid ${V.accent}55`, padding: "1px 5px", borderRadius: 5, fontWeight: 700, flexShrink: 0, letterSpacing: "0.03em" }}>İNCELE</span>
          )}
        </div>
        <div style={{ fontSize: "11.5px", color: V.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span className="num" style={{ fontSize: "14px", fontWeight: 600, color: s.amtRenk, fontFamily: MONO }}>
          {s.sign}{TL(t.miktar)}
        </span>
        {t.orjinalPb && t.orjinalPb !== "TRY" && (
          <div style={{ fontSize: "10.5px", color: V.ink3, fontFamily: MONO }}>{pbSembol(t.orjinalPb)}{(t.orjinalTutar || 0).toLocaleString("tr-TR")}</div>
        )}
      </div>
      <DelBtn onClick={() => onSil(t.tip, t.id)} />
    </div>
  );
}

export function Islemler({ findata, fd, donem, bildir, setFindata, baslangicFiltre, onFiltreTemizle, onSil, onDuzenle, onGelirEkle, onGiderEkle, onAbonelikEkle }) {
  const [filter, setFilter] = useState(() => (baslangicFiltre === "incele" ? "incele" : "tumu"));
  const [q, setQ] = useState("");
  const [kat, setKat] = useState(""); // kategori filtresi ("" = tümü)
  // Panel'den gelen tek-seferlik "İncele" odağını mount'ta tüket → sonraki
  // ziyaretlerde normal aç (sticky olmasın).
  useEffect(() => { if (baslangicFiltre && onFiltreTemizle) onFiltreTemizle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // İncelenecek işlemler (needs_review) — global backlog, döneme bağlı değil.
  const bekleyen = bekleyenInceleme(findata);
  const kisiAdi = (id) => (findata.kisiler || []).find((k) => String(k.id) === String(id))?.ad || "";

  // Bir kaydın finansal anlamını (tur) ayarla — ham başlık/tutar/tarih/kişi KORUNUR.
  // Sınıf sonrası KPI/Analiz/Karne paylaşılan turEtkisi katmanından güncellenir.
  function siniflaKayit(rec, yeniTur) {
    if (!setFindata) return;
    const list = rec._yon === "gelir" ? "gelirler" : "giderler";
    setFindata((d) => ({ ...d, [list]: (d[list] || []).map((x) => (String(x.id) === String(rec.id) ? { ...x, tur: yeniTur } : x)) }));
    bildir && bildir(`"${rec.baslik}" → ${turEtiket(yeniTur)} olarak sınıflandı`, "ok");
  }

  const hepsi = [
    ...(fd.gelirler || []).map((x) => ({ ...x, tip: "gelir" })),
    ...(fd.giderler || []).map((x) => ({ ...x, tip: "gider" })),
    ...(findata.abonelikler || []).map((x) => ({ ...x, tip: "abonelik" })),
  ].sort((a, b) => String(b.tarih || "").localeCompare(String(a.tarih || "")));

  const hesapAdi = (id) => (findata.hesaplar || []).find((h) => String(h.id) === String(id))?.ad || "";
  // Mevcut listedeki kategoriler (filtre açılır menüsü için)
  const katSecenek = [...new Set(hepsi.map((t) => t.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));

  const aranan = q.trim().toLocaleLowerCase("tr");
  const liste = hepsi.filter((t) => {
    if (filter !== "tumu" && t.tip !== filter) return false;
    if (kat && (t.kategori || "") !== kat) return false;
    if (!aranan) return true;
    const metin = `${t.baslik || ""} ${t.kategori || ""} ${hesapAdi(t.hesapId)}`.toLocaleLowerCase("tr");
    return metin.includes(aranan);
  });

  // Özet (filtreli liste): gelir / gider / net
  const ozetGelir = liste.filter((t) => t.tip === "gelir").reduce((s, t) => s + (+t.miktar || 0), 0);
  const ozetGider = liste.filter((t) => t.tip !== "gelir").reduce((s, t) => s + (+t.miktar || 0), 0);

  // Aya göre grupla (YYYY-MM), her grupta net alt-toplam
  const gruplar = {};
  liste.forEach((t) => { const ay = String(t.tarih || "").slice(0, 7) || "—"; (gruplar[ay] = gruplar[ay] || []).push(t); });
  const aylar = Object.keys(gruplar).sort().reverse();
  const ayBaslik = (ay) => { const [y, m] = ay.split("-"); return AY_ADI[+m - 1] ? `${AY_ADI[+m - 1]} ${y}` : ay; };
  const ayNet = (arr) => arr.reduce((s, t) => s + (t.tip === "gelir" ? +t.miktar : -t.miktar), 0);

  const FILTRELER = [
    { id: "tumu", label: "Tümü" },
    { id: "gelir", label: "Gelir" },
    { id: "gider", label: "Gider" },
    { id: "abonelik", label: "Abonelik" },
    ...(bekleyen.adet ? [{ id: "incele", label: `İncele · ${bekleyen.adet}`, uyari: true }] : []),
  ];

  return (
    <div className="fa-page">
      <div style={{ display: "flex", gap: "9px", marginBottom: "18px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: 4, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11 }}>
          {FILTRELER.map((ff) => {
            const on = filter === ff.id;
            const bg = on ? (ff.uyari ? V.accent : V.emerald) : "transparent";
            const renk = on ? "#F4F1E9" : ff.uyari ? V.accent : V.ink2;
            return (
              <button
                key={ff.id}
                onClick={() => setFilter(ff.id)}
                className="fa-btn"
                style={{ border: "none", borderRadius: 8, padding: "8px 13px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: F, background: bg, color: renk, whiteSpace: "nowrap" }}
              >
                {ff.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: "8px", padding: "8px 13px", background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11, color: V.ink3 }}>
          <Icon d="search" size={15} stroke={V.ink3} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İşlem ara…"
            style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", color: V.ink, fontSize: "13px", fontFamily: F }}
          />
        </div>
        {katSecenek.length > 0 && (
          <select
            value={kat}
            onChange={(e) => setKat(e.target.value)}
            title="Kategoriye göre filtrele"
            style={{ padding: "9px 11px", background: kat ? V.emerald : V.card2, color: kat ? "#F4F1E9" : V.ink2, border: `1px solid ${V.border}`, borderRadius: 11, fontSize: "13px", fontFamily: F, fontWeight: 600, cursor: "pointer", outline: "none", maxWidth: 170 }}
          >
            <option value="">Tüm kategoriler</option>
            {katSecenek.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onGelirEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Gelir</Btn>
          <Btn variant="ghost" onClick={onGiderEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Gider</Btn>
          <Btn variant="ghost" onClick={onAbonelikEkle} style={{ padding: "9px 13px" }}><Icon d="plus" size={15} /> Abonelik</Btn>
        </div>
      </div>

      {filter === "incele" ? (
        (() => {
          const bekleyenListe = bekleyen.kayitlar.filter((r) => !aranan || `${r.baslik || ""} ${kisiAdi(r.kisiId)}`.toLocaleLowerCase("tr").includes(aranan));
          return bekleyenListe.length === 0 ? (
            <Bos baslik="İncelenecek işlem yok" mesaj="Sınıflandırılmayı bekleyen işlem yok. Hane kişilerine giden/gelen para burada listelenir." icon="doc" />
          ) : (
            <>
              <div style={{ background: "var(--chip-amber)", border: `1px solid ${V.accent}55`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: V.ink, marginBottom: 3 }}>🔎 {bekleyen.adet} işlem · {TL(bekleyen.toplam)} sınıflandırılmayı bekliyor</div>
                <div style={{ fontSize: 12, color: V.ink2, lineHeight: 1.5 }}>Ham işleme dokunulmaz — yalnızca <b>finansal anlamını</b> seçersin. Renkli nokta KPI etkisini gösterir: <span style={{ color: V.neg }}>● gider</span> · <span style={{ color: V.pos }}>● gelir/iade</span> · <span style={{ color: V.ink3 }}>● nötr</span>. İstediğin zaman değiştirebilirsin.</div>
              </div>
              <Card style={{ padding: "4px 18px" }}>
                {bekleyenListe.map((r, i) => (
                  <InceleSatir key={`${r._yon}-${r.id}`} rec={r} kisiAd={kisiAdi(r.kisiId)} son={i === bekleyenListe.length - 1} onSinifla={siniflaKayit} />
                ))}
              </Card>
            </>
          );
        })()
      ) : liste.length === 0 ? (
        <Bos baslik="İşlem yok" mesaj="Bu dönemde işlem bulunmuyor." icon="doc" />
      ) : (
        <>
          {/* Özet şeridi */}
          <Card style={{ marginBottom: 14, padding: "13px 18px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>İşlem</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.ink, fontFamily: MONO }}>{liste.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gelir</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.pos, fontFamily: MONO }}>+{TL(ozetGelir)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gider</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: V.neg, fontFamily: MONO }}>−{TL(ozetGider)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: ozetGelir - ozetGider >= 0 ? V.pos : V.neg, fontFamily: MONO }}>{TL(ozetGelir - ozetGider)}</div>
            </div>
          </Card>

          {/* Aya göre gruplu liste */}
          {aylar.map((ay) => {
            const net = ayNet(gruplar[ay]);
            return (
              <div key={ay} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 4px 7px" }}>
                  <span className="serif" style={{ fontSize: 13.5, fontWeight: 600, color: V.ink2, fontFamily: SERIF }}>{ayBaslik(ay)}</span>
                  <span style={{ fontSize: 11.5, color: V.ink3 }}>
                    {gruplar[ay].length} işlem · net <b className="num" style={{ color: net >= 0 ? V.pos : V.neg, fontFamily: MONO }}>{TL(net)}</b>
                  </span>
                </div>
                <Card style={{ padding: "6px 18px" }}>
                  {gruplar[ay].map((t, i) => (
                    <IslemSatir key={`${t.tip}-${t.id}`} t={t} hesapAd={hesapAdi(t.hesapId)} son={i === gruplar[ay].length - 1} onDuzenle={onDuzenle} onSil={onSil} />
                  ))}
                </Card>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function IslemModal({ mod, form, setForm, kategorilerGelir, kategorilerGider, hesaplar, hafiza, kurlar, onClose, onKaydet }) {
  const abonelik = mod === "abonelik";
  const baslik = abonelik
    ? (form._editId ? "Abonelik Düzenle" : "Abonelik Ekle")
    : (form._editId ? "İşlem Düzenle" : "İşlem Ekle");

  // İçinde bulunulan tip için kategori listesi
  const katListe = abonelik ? (kategorilerGider || []) : (form.tip === "gelir" ? (kategorilerGelir || []) : (kategorilerGider || []));

  // Gelir/Gider geçişi: kategori yeni listede yoksa listenin ilkine çek
  function tipSec(tip) {
    const liste = tip === "gelir" ? (kategorilerGelir || []) : (kategorilerGider || []);
    setForm((f) => ({ ...f, tip, kategori: liste.includes(f.kategori) ? f.kategori : (liste[0] || f.kategori) }));
  }

  // Başlık değişiminde hafızadan kategori önerisi uygula
  function baslikDegis(v) {
    const key = (v || "").toLowerCase().trim().split(/\s+/).slice(0, 2).join(" ");
    const oneri = key && hafiza ? hafiza[key] : undefined;
    setForm((f) => ({ ...f, baslik: v, ...(oneri ? { kategori: oneri } : {}) }));
  }

  const segBtn = (tip, etiket) => {
    const on = form.tip === tip;
    return (
      <button
        type="button"
        onClick={() => tipSec(tip)}
        className="fa-btn"
        style={{ flex: 1, border: "none", borderRadius: 9, padding: "10px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: F, background: on ? V.emerald : V.card2, color: on ? "#F4F1E9" : V.ink2, ...(on ? {} : { border: `1px solid ${V.border}` }) }}
      >
        {etiket}
      </button>
    );
  };

  return (
    <Modal title={baslik} onClose={onClose} maxWidth={420}>
      {!abonelik && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {segBtn("gelir", "Gelir")}
          {segBtn("gider", "Gider")}
        </div>
      )}

      <Field label="Başlık" value={form.baslik} onChange={baslikDegis} placeholder="Örn: Migros market" />

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{abonelik ? "Aylık Ücret" : "Tutar"}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={form.miktar}
            onChange={(e) => setForm((f) => ({ ...f, miktar: e.target.value }))}
            inputMode="decimal"
            placeholder="0"
            style={{ ...inputStyle, fontFamily: MONO, flex: 1, width: "auto" }}
          />
          <select
            value={form.pb || "TRY"}
            onChange={(e) => setForm((f) => ({ ...f, pb: e.target.value }))}
            style={{ ...inputStyle, width: 96, flex: "none", cursor: "pointer" }}
          >
            {PB_SECENEK.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        {form.pb && form.pb !== "TRY" && (
          <div style={{ fontSize: "11.5px", marginTop: 6, color: kurlar ? V.ink3 : V.neg }}>
            {kurlar
              ? `≈ ${TL(tryeCevir(sayiCevir(form.miktar), form.pb, kurlar) || 0)} olarak kaydedilir (${pbSembol(form.pb)}1 = ${TL(form.pb === "USD" ? kurlar.usd : kurlar.eur)})`
              : "Kur bilgisi yok — Ayarlar → Kur'dan güncelle."}
          </div>
        )}
      </div>

      <Field
        label="Kategori"
        value={form.kategori}
        onChange={(v) => setForm((f) => ({ ...f, kategori: v }))}
        options={katListe}
      />

      <Field
        label="Tarih"
        type="date"
        value={form.tarih}
        onChange={(v) => setForm((f) => ({ ...f, tarih: v }))}
      />

      {!abonelik && (
        <>
          <Field
            label="Hesap"
            value={form.hesapId || ""}
            onChange={(v) => setForm((f) => ({ ...f, hesapId: v }))}
            options={[{ id: "", label: "Hesap yok" }, ...((hesaplar || []).map((h) => ({ id: String(h.id), label: h.ad || "Hesap" })))]}
          />

          {!form._editId && (
            <div style={{ marginBottom: "14px" }}>
              <Toggle
                label="Her ay tekrarla"
                sub="Kira, maaş, abonelik gibi sabit kalemler"
                checked={!!form.tekrarla}
                onChange={(v) => setForm((f) => ({ ...f, tekrarla: v }))}
              />
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <Toggle label="Hane ortak" checked={!!form.hane} onChange={(v) => setForm((f) => ({ ...f, hane: v }))} />
          </div>
        </>
      )}

      <Btn variant="primary" onClick={onKaydet} style={{ width: "100%", padding: "13px", marginTop: "2px" }}>Kaydet</Btn>
    </Modal>
  );
}
