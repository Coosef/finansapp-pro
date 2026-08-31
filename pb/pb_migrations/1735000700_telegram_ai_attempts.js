/// <reference path="../pb_data/types.d.ts" />
// T2C.2 — DAYANIKLI UPSTREAM DENEME SAYACI.
//
// NEDEN: T2C'de ücretli sağlayıcı retry bütçesi gateway'in `reclaimed` bayrağına bakıyordu.
// `reclaimed=true` yalnızca "bu Telegram update'i daha önce bir kez claim edilip başarısız
// oldu" demektir; "daha önce GERÇEK bir upstream çağrısı yapıldı ve geçici hata aldı"
// DEMEZ. Karşı örnekler: 409 processing (upstream çağrısı 0), PB iç 503 (upstream çağrısı 0),
// upstream ÖNCESİ başka bir geçici hata. Bu durumlarda bir sonraki denemedeki İLK gerçek
// 502/transient yanlışlıkla "ikinci başarısızlık" sayılıp terminal hâle geliyordu.
//
// ÇÖZÜM: bütçe otoritesi PocketBase'e taşınır. `upstream_attempts` DAYANIKLI olarak,
// update_id başına, YALNIZ gerçek bir upstream çağrısı yapılmak üzereyken artırılır.
// Gateway süreç belleğinden ve telegram_updates.attempts/reclaimed'dan BAĞIMSIZDIR.
//
// ALAN SÖZLEŞMESİ: tamsayı, min 0, required DEĞİL. required olsaydı PB 0 değerini
// "boş" sayıp reddederdi; bu alanın doğal başlangıç değeri tam olarak 0'dır.
// Alanı olmayan ESKİ satırlar okunduğunda 0 döner → yükseltme sonrası eski satırlar
// bütçelerini tüketmiş sayılmaz (doğru ve güvenli varsayılan).
//
// GÜVENLİ YÜKSELTME: bu migration YALNIZ şema ekler. Var olan satırların
// answer / request_hash / status / lease_until / expires_at değerlerine DOKUNMAZ;
// hiçbir satır silinmez; API kuralları NULL olarak KALIR (generic REST erişimi yok).
// Zaten uygulanmışsa (alan varsa) hiçbir şey yapmaz → idempotent.
//
// TARİHSEL migration 1735000500_telegram_ai_t2b.js BİLEREK DEĞİŞTİRİLMEMİŞTİR.
migrate(
  (app) => {
    let col;
    try { col = app.findCollectionByNameOrId("telegram_ai_results"); } catch (_) { return; } // koleksiyon yoksa yapacak bir şey yok

    let varMi = false;
    try { varMi = !!col.fields.getByName("upstream_attempts"); } catch (_) { varMi = false; }
    if (varMi) return; // idempotent: ikinci kez uygulanırsa no-op

    col.fields.add(new NumberField({ name: "upstream_attempts", onlyInt: true, min: 0 }));
    app.save(col);
  },
  (app) => {
    // GERİ ALMA: bu alan yalnızca bir sayaçtır — kullanıcı verisi, cevap metni veya kimlik
    // içermez. Bu yüzden ai_keys onarımından FARKLI olarak geri alınabilir; alanın
    // kaldırılması hiçbir kullanıcı içeriğini yok etmez (yalnız bütçe sayımı sıfırlanır).
    let col;
    try { col = app.findCollectionByNameOrId("telegram_ai_results"); } catch (_) { return; }
    let alan = null;
    try { alan = col.fields.getByName("upstream_attempts"); } catch (_) { alan = null; }
    if (!alan) return;
    col.fields.removeById(alan.id);
    app.save(col);
  }
);
