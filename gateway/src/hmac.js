// ============================================================
// Gateway ↔ PB HMAC v1 imza (üretim signer). PB tarafı (pb_hooks/tg_lib.js) ile BİREBİR:
//   canonical = "v1\n"+ts+"\n"+nonce+"\n"+METHOD+"\n"+PATH+"\n"+sha256(rawBody)
//   signature = HMAC-SHA256(canonical, secret)  → lowercase hex
// Gateway her istekte YENİ nonce üretir (replay guard PB tarafında atomik).
// ============================================================
import crypto from "node:crypto";

export const sha256hex = (s) => crypto.createHash("sha256").update(s ?? "", "utf8").digest("hex");
export const hmacHex = (text, secret) => crypto.createHmac("sha256", secret).update(text, "utf8").digest("hex");

export function canonicalString(ts, nonce, method, path, rawBody) {
  return "v1\n" + ts + "\n" + nonce + "\n" + String(method).toUpperCase() + "\n" + path + "\n" + sha256hex(rawBody || "");
}

// path: yalnız endpoint yolu (query'siz), PB'nin imzaladığı ile aynı olmalı.
export function imzaBasliklari({ secret, method, path, rawBody, ts, nonce }) {
  const t = ts != null ? ts : Math.floor(Date.now() / 1000);
  const n = nonce != null ? nonce : crypto.randomBytes(16).toString("hex");
  const sig = hmacHex(canonicalString(t, n, method, path, rawBody || ""), secret);
  return { "X-TG-Version": "1", "X-TG-Timestamp": String(t), "X-TG-Nonce": n, "X-TG-Signature": sig };
}
