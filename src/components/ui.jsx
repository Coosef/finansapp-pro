// ============================================================
// Yeniden kullanılabilir UI parçaları
// ============================================================
import { C, F, inputStyle } from "../lib/constants.js";

export function Field({ label, type = "text", value, onChange, options, placeholder }) {
  return (
    <div style={{ marginBottom: "0.9rem" }}>
      <label style={{ display: "block", color: C.dim, fontSize: "0.74rem", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
          {options.map((o) => (typeof o === "object" ? <option key={o.id} value={o.id}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", marginBottom: "0.9rem" }}>
      <div style={{ width: 40, height: 22, borderRadius: 999, background: checked ? C.indigo : C.line2, position: "relative", transition: "all .2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 21 : 3, transition: "all .2s" }} />
      </div>
      <span style={{ color: C.dim, fontSize: "0.85rem" }}>{label}</span>
    </div>
  );
}

export function Card({ children, style = {}, accent }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: "1rem", padding: "1.4rem", position: "relative", overflow: "hidden", ...style }}>
      {accent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent }} />}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", style = {}, disabled }) {
  const v = {
    primary: { background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff" },
    green: { background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "#fff" },
    red: { background: "linear-gradient(135deg,#EF4444,#B91C1C)", color: "#fff" },
    amber: { background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#fff" },
    ghost: { background: "#1A1D27", color: C.dim, border: `1px solid ${C.line2}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ border: "none", padding: "0.6rem 1.1rem", borderRadius: "0.6rem", cursor: disabled ? "not-allowed" : "pointer", fontFamily: F, fontWeight: 600, fontSize: "0.85rem", opacity: disabled ? 0.5 : 1, ...v[variant], ...style }}>
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", overflow: "auto" }}>
      <div style={{ background: C.card, border: `1px solid ${C.line2}`, borderRadius: "1rem", padding: "1.75rem", width: "100%", maxWidth: wide ? 640 : 440, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3 style={{ color: C.text, fontFamily: F, fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "#1E2130", border: "none", color: C.dim, width: 30, height: 30, borderRadius: "50%", cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, color, height = 8 }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const renk = color || (pct >= 100 ? C.red : pct >= 80 ? C.amber : C.green);
  return (
    <div style={{ background: C.line, borderRadius: 999, height }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: renk, transition: "width .6s" }} />
    </div>
  );
}

export function Stat({ title, value, sub, subColor, color, icon }) {
  return (
    <Card accent={color}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: C.dimmer, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.5rem" }}>{title}</p>
          <p style={{ color: C.text, fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>{value}</p>
          {sub && <p style={{ color: subColor || C.dimmer, fontSize: "0.74rem", margin: "0.3rem 0 0" }}>{sub}</p>}
        </div>
        <span style={{ fontSize: "1.6rem", opacity: 0.75 }}>{icon}</span>
      </div>
    </Card>
  );
}

export function DelBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: "#1E1525", border: "1px solid #3D1A2E", color: C.redL, width: 28, height: 28, borderRadius: "0.4rem", cursor: "pointer", fontSize: "0.78rem", flexShrink: 0 }}>
      ✕
    </button>
  );
}

export function Bos({ mesaj }) {
  return (
    <div style={{ background: C.card2, border: `1px dashed ${C.line2}`, borderRadius: "0.8rem", padding: "2rem", textAlign: "center", color: C.dimmer, fontSize: "0.85rem", marginBottom: "1rem" }}>
      {mesaj}
    </div>
  );
}
