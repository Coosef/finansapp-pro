// ============================================================
// Hesaplar & Cüzdanlar — Zümrüt & Altın tasarımı
// ============================================================
import { useState } from "react";
import { V, F, SERIF, MONO, HESAP_TIP } from "../lib/constants.js";
import { uid, TL, bugun, sayiCevir } from "../lib/format.js";
import { transferUygula, transferleriEslestir } from "../lib/finance.js";
import { Card, Btn, Field, Modal, DelBtn, Bos } from "../components/ui.jsx";
import { Icon } from "../components/icons.jsx";

// ---- Hesaplar arası akış diyagramı (SVG Sankey: sol kaynak → sağ hedef) ----
// Ok başları sabit boyut (markerUnits=userSpaceOnUse) → çizgi kalınlığıyla
// büyümez. Tutarlar diyagramda değil, alttaki legend'de (çakışmayı önler).
function AkisDiyagram({ ozet }) {
  if (!ozet?.length) return null;
  const kisalt = (s) => (s.length > 17 ? s.slice(0, 16) + "…" : s);
  const sources = [...new Set(ozet.map((f) => f.fromAd))];
  const targets = [...new Set(ozet.map((f) => f.toAd))];
  const boxW = 150, boxH = 38, rowH = 54, W = 480;
  const n = Math.max(sources.length, targets.length, 1);
  const H = n * rowH + 8;
  const leftX = 4, rightX = W - boxW - 4;
  const colY = (arr, name) => {
    const cnt = arr.length, i = arr.indexOf(name);
    if (cnt === 1) return H / 2;
    const top = boxH / 2 + 6, bot = H - boxH / 2 - 6;
    return top + (bot - top) * (i / (cnt - 1));
  };
  const maxAmt = Math.max(...ozet.map((f) => f.toplam), 1);
  const sw = (amt) => 1.5 + (amt / maxAmt) * 7; // 1.5..8.5
  const dugum = (name, x, arr, key) => {
    const y = colY(arr, name);
    return (
      <g key={key}>
        <rect x={x} y={y - boxH / 2} width={boxW} height={boxH} rx="9" fill={V.card2} stroke={V.border2} />
        <text x={x + 12} y={y + 4} fontSize="11.5" fill={V.ink} fontWeight="600">{kisalt(name)}</text>
      </g>
    );
  };
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", marginBottom: 14, maxHeight: 260 }}>
      <defs>
        <marker id="akisOk" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" refX="7.5" refY="4.5" orient="auto">
          <path d="M1,1 L8,4.5 L1,8 Z" fill={V.emerald2} />
        </marker>
      </defs>
      {ozet.map((f, i) => {
        const y1 = colY(sources, f.fromAd), y2 = colY(targets, f.toAd);
        const x1 = leftX + boxW, x2 = rightX - 1, xm = (x1 + x2) / 2;
        return (
          <path key={i} d={`M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2 - 6},${y2}`} fill="none" stroke={V.emerald2} strokeOpacity="0.28" strokeWidth={sw(f.toplam)} strokeLinecap="round" markerEnd="url(#akisOk)" />
        );
      })}
      {sources.map((s) => dugum(s, leftX, sources, "s" + s))}
      {targets.map((t) => dugum(t, rightX, targets, "t" + t))}
    </svg>
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
