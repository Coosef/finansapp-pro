// ============================================================
// Hata sınırı — render sırasında çökme olursa beyaz ekran yerine
// güvenli, anlaşılır bir ekran gösterir. Kendi içinde bağımsız
// (uygulama modüllerine bağlı değil).
// ============================================================
import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null };
  }
  static getDerivedStateFromError(error) {
    return { hata: error };
  }
  componentDidCatch(error, info) {
    // Geliştirici konsoluna da yaz
    console.error("FinansApp çökme:", error, info?.componentStack);
  }
  render() {
    if (!this.state.hata) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#07090f", color: "#e2e8f0", fontFamily: "'Sora', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ maxWidth: 440, width: "100%", background: "rgba(18,20,30,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1rem", padding: "1.75rem", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>⚠️</div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 700 }}>Bir şeyler ters gitti</h1>
          <p style={{ margin: "0 0 1rem", color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Beklenmedik bir hata oluştu. <b style={{ color: "#4ade80" }}>Verilerin güvende</b> — tarayıcında saklı, kaybolmadı.
            Yeniden yüklemeyi dene; sürerse Rapor'dan yedek alıp geri yükleyebilirsin.
          </p>
          <pre style={{ textAlign: "left", background: "#0a0c13", border: "1px solid #1e2130", borderRadius: "0.5rem", padding: "0.6rem 0.75rem", fontSize: "0.72rem", color: "#f87171", overflow: "auto", maxHeight: 120, margin: "0 0 1.25rem" }}>
            {String(this.state.hata?.message || this.state.hata)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ width: "100%", border: "none", padding: "0.75rem", borderRadius: "0.6rem", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "0.9rem", color: "#fff", background: "linear-gradient(135deg,#10B981,#059669)" }}
          >
            Yeniden Yükle
          </button>
        </div>
      </div>
    );
  }
}
