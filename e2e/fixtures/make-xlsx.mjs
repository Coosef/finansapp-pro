import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Sentetik minimal .xlsx üretici (uygulamanın xlsx.js inlineStr reader'ıyla uyumlu).
// zip CLI ile paketler (macOS + ubuntu CI'da mevcut). Gerçek dosya → gerçek file input.
const COL = (i) => String.fromCharCode(65 + i);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => `<c r="${COL(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function makeXlsx(rows, outPath) {
  const dir = mkdtempSync(join(tmpdir(), "xlsxgen-"));
  writeFileSync(
    join(dir, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  );
  mkdirSync(join(dir, "_rels"));
  writeFileSync(
    join(dir, "_rels", ".rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  mkdirSync(join(dir, "xl"));
  writeFileSync(
    join(dir, "xl", "workbook.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
  mkdirSync(join(dir, "xl", "_rels"));
  writeFileSync(
    join(dir, "xl", "_rels", "workbook.xml.rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  );
  mkdirSync(join(dir, "xl", "worksheets"));
  writeFileSync(join(dir, "xl", "worksheets", "sheet1.xml"), sheetXml(rows));
  execFileSync("zip", ["-X", "-r", "-q", outPath, "[Content_Types].xml", "_rels", "xl"], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  return outPath;
}

// Senaryo fixture satırları (SENTETİK, deterministik).
export const HEADER = ["Tarih", "Açıklama", "Tutar"];
export const STATEMENT_B = [
  HEADER,
  ["05.08.2026", "Migros Market", "-1200"],
  ["06.08.2026", "Shell Benzin", "-800"],
  ["07.08.2026", "Defacto Giyim", "-500"],
];
