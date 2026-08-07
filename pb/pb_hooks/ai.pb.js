/// <reference path="../pb_data/types.d.ts" />
// AI proxy: /ai → Anthropic Messages API'ye SUNUCUDAN ilet.
// Anthropic anahtarı ANTHROPIC_API_KEY ortam değişkeninden okunur → tarayıcıya asla gitmez.
// Yalnız giriş yapmış kullanıcılar (açık proxy = API kredisi hırsızlığı riski).
routerAdd(
  "POST",
  "/ai",
  (e) => {
    const key = $os.getenv("ANTHROPIC_API_KEY");
    if (!key) {
      return e.json(503, { message: "AI proxy yapılandırılmadı: sunucuda ANTHROPIC_API_KEY yok." });
    }
    const body = e.requestInfo().body || {};
    if (!body.messages) {
      throw new BadRequestError("Geçersiz istek: 'messages' gerekli.");
    }
    let res;
    try {
      res = $http.send({
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        timeout: 120,
      });
    } catch (err) {
      return e.json(502, { message: "Anthropic'e ulaşılamadı: " + err });
    }
    // Anthropic yanıtını (JSON) olduğu gibi ilet — istemci mevcut biçimi bekler
    return e.json(res.statusCode, res.json);
  },
  $apis.requireAuth()
);
