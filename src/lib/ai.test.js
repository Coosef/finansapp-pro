import { describe, it, expect } from "vitest";
import { configureAI, aiHazir, yerelMi, varsayilanAdres, GEMINI_MODEL_SECENEK, SAGLAYICI_SECENEK, toGemini } from "./ai.js";

describe("AI sağlayıcı yapılandırması", () => {
  it("sağlayıcı listesi gemini içerir", () => {
    expect(SAGLAYICI_SECENEK.map((s) => s.id)).toContain("gemini");
  });
  it("varsayılan adres: gemini OpenAI-uyumlu ucu döner", () => {
    expect(varsayilanAdres("gemini")).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(varsayilanAdres("ollama")).toBe("http://localhost:11434/v1");
    expect(varsayilanAdres("anthropic")).toBe("");
  });
  it("anthropic: anahtar varsa hazır", () => {
    configureAI({ aiSaglayici: "anthropic", apiKey: "" });
    expect(aiHazir()).toBe(false);
    configureAI({ aiSaglayici: "anthropic", apiKey: "sk-ant-x" });
    expect(aiHazir()).toBe(true);
    expect(yerelMi()).toBe(false);
  });
  it("gemini: anahtar gerekir, model varsayılana düşer, openai-uyumlu sayılır", () => {
    configureAI({ aiSaglayici: "gemini", apiKey: "" });
    expect(aiHazir()).toBe(false);
    configureAI({ aiSaglayici: "gemini", apiKey: "AIza-x" });
    expect(aiHazir()).toBe(true);
    expect(yerelMi()).toBe(true); // web arama yok, localCall yolu
    expect(GEMINI_MODEL_SECENEK.length).toBeGreaterThan(0);
  });
  it("toGemini: metin/görsel/belge bloklarını native parts'a çevirir", () => {
    const { contents } = toGemini([
      { role: "user", content: [
        { type: "text", text: "Ekstre" },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "SU1H" } },
      ] },
      { role: "assistant", content: "tamam" },
    ]);
    expect(contents).toHaveLength(2);
    expect(contents[0].role).toBe("user");
    expect(contents[0].parts[0]).toEqual({ text: "Ekstre" });
    expect(contents[0].parts[1].inline_data).toEqual({ mime_type: "application/pdf", data: "QUJD" });
    expect(contents[0].parts[2].inline_data.mime_type).toBe("image/png");
    expect(contents[1].role).toBe("model"); // assistant → model
    expect(contents[1].parts[0]).toEqual({ text: "tamam" });
  });

  it("openai: anahtar gerekir, sabit uç, openai-uyumlu sayılır", () => {
    configureAI({ aiSaglayici: "openai", apiKey: "" });
    expect(aiHazir()).toBe(false);
    configureAI({ aiSaglayici: "openai", apiKey: "sk-x" });
    expect(aiHazir()).toBe(true);
    expect(yerelMi()).toBe(true);
    expect(varsayilanAdres("openai")).toBe("https://api.openai.com/v1");
  });

  it("yerel (ollama): adres varsa hazır, anahtar gerekmez", () => {
    configureAI({ aiSaglayici: "ollama", yerelAdres: "http://localhost:11434/v1", yerelModel: "qwen2.5vl:7b" });
    expect(aiHazir()).toBe(true);
    configureAI({ aiSaglayici: "ollama", yerelAdres: "" });
    expect(aiHazir()).toBe(true); // varsayılan adres devreye girer
  });
});
