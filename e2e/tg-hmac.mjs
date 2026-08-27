// Telegram gateway ↔ PB HMAC v1 — cross-runtime reference signer (Node).
// PB tarafı (pb_hooks/tg.pb.js) ile BİREBİR aynı canonical string + hs256(canonical, secret).
// Canonical: "v1\n"+ts+"\n"+nonce+"\n"+METHOD+"\n"+PATH+"\n"+sha256(rawBody)
import crypto from "node:crypto";

export const sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
export const hmacHex = (text, secret) => crypto.createHmac("sha256", secret).update(text, "utf8").digest("hex");

export function canonicalString(ts, nonce, method, path, rawBody) {
  return "v1\n" + ts + "\n" + nonce + "\n" + String(method).toUpperCase() + "\n" + path + "\n" + sha256hex(rawBody || "");
}

// İmzalı header'lar üret. opts ile ts/nonce/secret override edilerek negatif testler kurulur.
export function signHeaders({ secret, method, path, rawBody, ts, nonce }) {
  const t = ts != null ? ts : Math.floor(Date.now() / 1000);
  const n = nonce != null ? nonce : crypto.randomBytes(16).toString("hex");
  const sig = hmacHex(canonicalString(t, n, method, path, rawBody || ""), secret);
  return { "X-TG-Version": "1", "X-TG-Timestamp": String(t), "X-TG-Nonce": n, "X-TG-Signature": sig };
}

// HMAC ile POST — küçük yardımcı.
export async function tgServicePost(base, path, bodyObj, opts = {}) {
  const rawBody = JSON.stringify(bodyObj || {});
  const headers = signHeaders({ secret: opts.secret, method: "POST", path, rawBody, ts: opts.ts, nonce: opts.nonce });
  if (opts.mutateHeaders) opts.mutateHeaders(headers);
  const url = base + path;
  const res = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: opts.rawBodyOverride != null ? opts.rawBodyOverride : rawBody });
  let json = null; try { json = await res.json(); } catch { /* boş */ }
  return { status: res.status, json };
}
