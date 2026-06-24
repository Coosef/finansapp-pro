/// <reference path="../pb_data/types.d.ts" />
// Davet kodu ile haneye katılma. Üyelik (members) güncelleme kuralı "sadece üyeler"
// olduğundan, henüz üye olmayan biri kendini ekleyemez. Bu uç nokta giriş yapmış
// kullanıcıyı, doğru kodu verirse hanenin üyelerine güvenli şekilde ekler.
routerAdd(
  "POST",
  "/api/hane/katil",
  (e) => {
    const info = e.requestInfo();
    const userId = info.auth && info.auth.id;
    if (!userId) throw new UnauthorizedError("Giriş gerekli.");

    const kod = ((info.body && info.body.kod) || "").toString().trim();
    if (!kod) throw new BadRequestError("Davet kodu gerekli.");

    let hane;
    try {
      hane = e.app.findFirstRecordByFilter("haneler", "kod = {:kod}", { kod });
    } catch (err) {
      throw new NotFoundError("Bu koda sahip bir hane bulunamadı.");
    }

    const uyeler = hane.get("members") || [];
    if (uyeler.indexOf(userId) === -1) {
      uyeler.push(userId);
      hane.set("members", uyeler);
      e.app.save(hane);
    }
    return e.json(200, { id: hane.id, ad: hane.get("ad") });
  },
  $apis.requireAuth()
);
