// ============================================================
// Metin tabanlı PDF ekstresi → satır ızgarası (yerel, AI'sız).
// pdfjs ile metni koordinatlarıyla çıkarır, sütun çapalarına göre
// tabloyu yeniden kurar (sarmalanan açıklama satırlarını birleştirir).
// Çıktı ekstreParse'a verilebilen string[][] ızgaradır.
// Taranmış/görsel PDF'lerde boş döner → çağıran AI yoluna düşer.
// ============================================================

const kucuk = (s) => String(s ?? "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

// Bir satır tablo başlığı mı? ("Tarih" + "Tutar" içerir)
function baslikMi(ln) {
  const t = ln.map((i) => kucuk(i.s));
  return t.some((x) => /^tarih$|işlem tarihi/.test(x)) && t.some((x) => /tutar/.test(x));
}

// Atlanacak bakiye/özet satırı mı?
function atlaSatir(metin) {
  return /bir önceki ekstre bakiye|önceki dönem|devreden bakiye|dönem başı bakiye|dönem sonu bakiye|ara toplam|genel toplam|^toplam$/.test(kucuk(metin));
}

// Başlık satırından sütun x-çapalarını çıkar
function sutunCapa(hdr) {
  const c = { tarih: null, aciklama: null, tutar: null, bakiye: null };
  for (const it of hdr) {
    const t = kucuk(it.s);
    if (c.tarih == null && /tarih/.test(t)) c.tarih = it.x;
    else if (c.aciklama == null && /açıklama|aciklama|hareket tipi/.test(t)) c.aciklama = it.x;
    else if (/tutar/.test(t)) c.tutar = it.x;
    else if (/bakiye/.test(t)) c.bakiye = it.x;
  }
  if (c.aciklama == null) c.aciklama = (c.tarih ?? 0) + 50;
  if (c.tutar == null) c.tutar = (c.bakiye ?? 9999) - 80;
  return c;
}

const TUTAR_RE = /-?\s?\d[\d.]*,\d{2}/; // 1.813,44 | - 4.269,12 | 700,00
const TARIH_RE = /\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/;

// Satır listesini (her satır [{x,s}]) ızgaraya çevir
function gridKur(lines) {
  const out = [];
  const ilkBaslik = lines.findIndex(baslikMi);
  const blokSon = ilkBaslik === -1 ? lines.length : ilkBaslik;

  // Başlık bloğu → etiket/değer çiftleri (ekstreParse üst-tarama için)
  for (let i = 0; i < blokSon; i++) {
    const ln = lines[i].filter((it) => it.s !== ":"); // ":" ayraç öğelerini at
    for (let j = 0; j < ln.length; j += 2) {
      if (j + 1 < ln.length) out.push([ln[j].s, ln[j + 1].s]);
      else out.push([ln[j].s]);
    }
  }
  if (ilkBaslik === -1) return out;

  let i = ilkBaslik;
  while (i < lines.length) {
    if (!baslikMi(lines[i])) { i++; continue; }
    const cols = sutunCapa(lines[i]);
    out.push(["Tarih", "Açıklama", "Tutar", "Bakiye"]); // sentetik başlık (her bölüm)
    i++;
    let bekleyenAcik = "";
    let cur = null;
    for (; i < lines.length; i++) {
      const ln = lines[i];
      if (baslikMi(ln)) break; // sonraki bölüm
      const duzMetin = ln.map((x) => x.s).join(" ");
      if (atlaSatir(duzMetin)) { if (cur) { out.push(cur); cur = null; } bekleyenAcik = ""; continue; }
      // Güçlü footer işareti → bölüm sonu (işlem açıklamalarıyla ÇAKIŞMAYAN kalıplar)
      if (/bir sonraki ekstre|güncel akdi faiz|sözleşme değişik|yıllık brüt faiz oran/.test(kucuk(duzMetin))) { i++; break; }

      const dateItem = ln.find((it) => Math.abs(it.x - cols.tarih) < 30 && TARIH_RE.test(it.s));
      const tutarBit = cols.bakiye != null ? cols.bakiye - 45 : Infinity;
      const amtItem = ln.find((it) => it.x >= cols.tutar - 70 && it.x < tutarBit && TUTAR_RE.test(it.s) && !/%/.test(it.s));
      const bakItem = cols.bakiye != null ? ln.find((it) => it.x >= cols.bakiye - 45 && TUTAR_RE.test(it.s)) : null;
      const acikItems = ln.filter((it) => it.x > cols.tarih + 30 && it.x < cols.tutar - 70 && it !== dateItem);
      const acik = acikItems.map((it) => it.s).join(" ").replace(/\s+/g, " ").trim();

      if (dateItem && amtItem) {
        if (cur) out.push(cur);
        const desc = (bekleyenAcik + " " + acik).replace(/\s+/g, " ").trim();
        bekleyenAcik = "";
        cur = [dateItem.s, desc, amtItem.s.replace(/\s/g, ""), bakItem ? bakItem.s.replace(/\s/g, "") : ""];
      } else if (acik) {
        // Açıklama satırları çoğu bankada tutar satırının ÜSTÜNDE durur →
        // her zaman bir SONRAKİ işleme ata (önceki işleme bulaştırma).
        bekleyenAcik = (bekleyenAcik + " " + acik).replace(/\s+/g, " ").trim();
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Sayfa-bazlı metin öğelerinden ({x,y,s}[][]) ızgara kur — saf, test edilebilir
export function satirlariCoz(pagesItems) {
  const lines = [];
  for (const items of pagesItems || []) {
    const kovalar = [];
    for (const it of items) {
      if (!it.s || !String(it.s).trim()) continue;
      let kova = kovalar.find((k) => Math.abs(k.y - it.y) <= 2.5);
      if (!kova) { kova = { y: it.y, items: [] }; kovalar.push(kova); }
      kova.items.push({ x: it.x, s: String(it.s).trim() });
    }
    kovalar.sort((a, b) => b.y - a.y); // üstten alta
    for (const k of kovalar) lines.push(k.items.sort((a, b) => a.x - b.x).filter((it) => it.s));
  }
  return gridKur(lines);
}

// Tarayıcı: bir PDF File/Blob → { rows }. Metin yoksa rows boş döner.
export async function pdfToRows(file) {
  const pdfjsLib = await import("pdfjs-dist");
  try {
    const W = (await import("pdfjs-dist/build/pdf.worker.min.mjs?worker")).default;
    pdfjsLib.GlobalWorkerOptions.workerPort = new W();
  } catch { /* worker zaten ayarlı olabilir */ }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  const n = Math.min(pdf.numPages, 30);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => it.str).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
  }
  return { rows: satirlariCoz(pages) };
}
