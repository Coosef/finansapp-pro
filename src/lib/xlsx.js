// ============================================================
// Sıfır-bağımlılık XLSX okuyucu: .xlsx (ZIP+XML) → satır ızgarası.
// Tarayıcının DecompressionStream'i ile açar; harici kütüphane yok.
// Yalnızca okuma; banka ekstresi gibi basit sayfalar için yeterli.
// ============================================================

// Ham deflate akışını çöz (ZIP method 8). Tarayıcı + Node 18+ destekler.
async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Response(bytes).body.pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

const utf8 = (b) => new TextDecoder("utf-8").decode(b);

// ZIP merkezî dizinini oku → { name: {method, compSize, localOffset} }
function zipDizin(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // EOCD imzasını (PK\x05\x06) sondan ara
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Geçersiz XLSX (ZIP sonu bulunamadı)");
  const adet = dv.getUint16(eocd + 10, true);
  const offset = dv.getUint32(eocd + 16, true);
  const girisler = {};
  let p = offset;
  for (let i = 0; i < adet; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break; // merkezî dizin başlığı
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = utf8(buf.subarray(p + 46, p + 46 + nameLen));
    girisler[name] = { method, compSize, localOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { buf, dv, girisler };
}

// Bir ZIP girişinin baytlarını çöz (stored veya deflate)
async function zipOku(zip, name) {
  const e = zip.girisler[name];
  if (!e) return null;
  const { dv, buf } = zip;
  // Yerel başlık: ad/extra uzunlukları merkezî dizinden FARKLI olabilir
  const lhNameLen = dv.getUint16(e.localOffset + 26, true);
  const lhExtraLen = dv.getUint16(e.localOffset + 28, true);
  const veriBas = e.localOffset + 30 + lhNameLen + lhExtraLen;
  const comp = buf.subarray(veriBas, veriBas + e.compSize);
  if (e.method === 0) return comp;             // sıkıştırılmamış
  if (e.method === 8) return await inflateRaw(comp); // deflate
  throw new Error("Desteklenmeyen sıkıştırma: " + e.method);
}

const xmlCoz = (s) =>
  String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // en son: çift çözmeyi önler

// "A14" → 0 tabanlı sütun indeksi (A→0, G→6, AA→26)
function sutunIndeks(ref) {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// sharedStrings.xml → metin dizisi (her <si> bir öğe; <r> run'larını birleştir)
function paylasilanlar(xml) {
  if (!xml) return [];
  const out = [];
  for (const parca of xml.split("</si>")) {
    if (!parca.includes("<si")) continue; // son artık parça
    let metin = "";
    const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(parca))) metin += xmlCoz(m[1]);
    out.push(metin);
  }
  return out;
}

// sheet XML → satır dizisi (her satır sütun-indeksli hücre metni dizisi)
function sayfaCoz(xml, paylasilan) {
  const satirlar = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const hucreler = [];
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1] || "";
      const inner = cm[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const ci = ref ? sutunIndeks(ref) : hucreler.length;
      let val = "";
      if (t === "s") {
        const vi = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = vi != null ? (paylasilan[+vi] ?? "") : "";
      } else if (t === "inlineStr" || t === "str") {
        const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let m;
        while ((m = re.exec(inner))) val += xmlCoz(m[1]);
      } else {
        const vi = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        val = vi != null ? xmlCoz(vi) : "";
      }
      hucreler[ci] = val;
    }
    satirlar.push(hucreler);
  }
  return satirlar;
}

// İlk sayfanın yolunu workbook ilişkilerinden bul (yoksa sheet1'e düş)
function ilkSayfaYolu(zip) {
  const wb = zip.girisler["xl/workbook.xml"];
  if (wb && zip.girisler["xl/worksheets/sheet1.xml"]) return "xl/worksheets/sheet1.xml";
  // Herhangi bir worksheet xml'i
  const adlar = Object.keys(zip.girisler).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  adlar.sort();
  return adlar[0] || "xl/worksheets/sheet1.xml";
}

// Bir .xlsx File/Blob/ArrayBuffer/Uint8Array → { rows: string[][] }
export async function xlsxToGrid(input) {
  let buf;
  if (input instanceof Uint8Array) buf = input;
  else if (input instanceof ArrayBuffer) buf = new Uint8Array(input);
  else if (input && typeof input.arrayBuffer === "function") buf = new Uint8Array(await input.arrayBuffer());
  else throw new Error("Geçersiz girdi");

  const zip = zipDizin(buf);
  const ssBytes = await zipOku(zip, "xl/sharedStrings.xml");
  const paylasilan = paylasilanlar(ssBytes ? utf8(ssBytes) : "");
  const sheetBytes = await zipOku(zip, ilkSayfaYolu(zip));
  if (!sheetBytes) throw new Error("XLSX sayfası bulunamadı");
  const rows = sayfaCoz(utf8(sheetBytes), paylasilan);
  return { rows };
}
