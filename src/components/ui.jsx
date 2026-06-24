// ============================================================
// Yeniden kullanılabilir UI parçaları — Zümrüt & Altın tasarımı
// ============================================================
import { V, F, SERIF, MONO } from "../lib/constants.js";
import { Icon } from "./icons.jsx";

const lbl = { display: "block", fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" };

export function Field({ label, type = "text", value, onChange, options, placeholder, mono, min, max }) {
  const base = {
    width: "100%", padding: "11px 13px", background: V.card2, border: `1px solid ${V.border}`,
    borderRadius: "10px", color: V.ink, fontSize: "13.5px", fontFamily: mono ? MONO : F,
    outline: "none", boxSizing: "border-box",
  };
  const num = type === "number" || mono;
  return (
    <div style={{ marginBottom: "14px" }}>
      {label && <label style={lbl}>{label}</label>}
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={base}>
          {options.map((o) => (typeof o === "object" ? <option key={o.id} value={o.id}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
        </select>
      ) : (
        <input
          type={type === "number" ? "text" : type}
          {...(num ? { inputMode: "decimal" } : {})}
          {...(min != null ? { min } : {})}
          {...(max != null ? { max } : {})}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...base, fontFamily: num ? MONO : F }}
        />
      )}
    </div>
  );
}

export function Toggle({ label, sub, checked, onChange }) {
  const track = { width: 42, height: 24, borderRadius: 99, background: checked ? V.accent : V.track, position: "relative", transition: "background .2s", flexShrink: 0, cursor: "pointer" };
  const knob = { position: "absolute", top: 3, left: 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transform: checked ? "translateX(18px)" : "none", transition: "transform .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" };
  if (!label) return <div onClick={() => onChange(!checked)} style={track}><div style={knob} /></div>;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
      <div>
        <div style={{ fontSize: "13.5px", color: V.ink }}>{label}</div>
        {sub && <div style={{ fontSize: "11.5px", color: V.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!checked)} style={track}><div style={knob} /></div>
    </div>
  );
}

export function Card({ children, style = {}, className = "" }) {
  return <div className={`fa-card ${className}`.trim()} style={style}>{children}</div>;
}

const BTN_V = {
  primary: { background: V.emerald, color: V.cream },
  gold: { background: V.accent, color: V.emerald },
  ghost: { background: V.card, color: V.ink, border: `1px solid ${V.border2}` },
  soft: { background: V.card2, color: V.ink, border: `1px solid ${V.border2}` },
  danger: { background: "transparent", color: V.neg, border: `1px solid ${V.neg}` },
  neg: { background: V.neg, color: "#fff" },
};

export function Btn({ children, onClick, variant = "primary", style = {}, disabled, title, type }) {
  return (
    <button className="fa-btn" onClick={onClick} disabled={disabled} title={title} type={type}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px", border: "none", padding: "10px 16px", borderRadius: "10px", cursor: disabled ? "not-allowed" : "pointer", fontFamily: F, fontWeight: 600, fontSize: "13.5px", opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap", ...BTN_V[variant], ...style }}>
      {children}
    </button>
  );
}

export function IconBtn({ icon, onClick, title, badge, active, style = {} }) {
  return (
    <button className="fa-ibtn fa-btn" onClick={onClick} title={title} style={{ ...(active ? { borderColor: V.accent, color: V.accent } : {}), ...style }}>
      <Icon d={icon} size={17} />
      {badge != null && badge !== 0 && (
        <span style={{ position: "absolute", top: 5, right: 6, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 99, background: V.neg, color: "#fff", fontSize: "9.5px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{badge}</span>
      )}
    </button>
  );
}

// Segmented (pill) kontrol — items: [{id,label}] veya [string]
export function Seg({ items, value, onChange, full }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 4, background: V.card2, border: `1px solid ${V.border}`, borderRadius: 11, ...(full ? { display: "flex", width: "100%" } : {}) }}>
      {items.map((it) => {
        const id = typeof it === "object" ? it.id : it;
        const label = typeof it === "object" ? it.label : it;
        const on = String(value) === String(id);
        return (
          <button key={id} onClick={() => onChange(id)} style={{ flex: full ? 1 : "none", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: F, transition: "background .15s, color .15s", background: on ? V.emerald : "transparent", color: on ? "#F4F1E9" : V.ink2 }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Ekranlar arası alt-sekme — Seg ile aynı görünüm, geriye dönük uyumlu API
export function SubNav({ items, value, onChange }) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <Seg items={items} value={value} onChange={onChange} />
    </div>
  );
}

export function Modal({ title, onClose, children, maxWidth = 420 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(8,14,11,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }}>
      <div onClick={(e) => e.stopPropagation()} className="fa-page" style={{ width: "100%", maxWidth, background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 24, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="serif" style={{ fontSize: 19, fontWeight: 600, color: V.ink }}>{title}</div>
          <button onClick={onClose} className="fa-btn" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: V.track, color: V.ink2, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, color, height = 8 }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  const renk = color || (pct >= 100 ? V.neg : pct >= 85 ? V.accent : V.pos);
  return (
    <div className="fa-bar" style={{ background: V.track, borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: renk }} />
    </div>
  );
}

export function Stat({ label, title, value, delta, deltaColor, sub, subColor }) {
  return (
    <div className="fa-card" style={{ padding: "16px 17px" }}>
      <div style={{ fontSize: "11.5px", color: V.ink3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label || title}</div>
      <div className="num" style={{ fontSize: "23px", fontWeight: 600, color: V.ink, margin: "8px 0 5px", letterSpacing: "-0.02em" }}>{value}</div>
      {(delta || sub) != null && (delta || sub) !== "" && (
        <div className="num" style={{ fontSize: "12px", color: deltaColor || subColor || V.ink3 }}>{delta || sub}</div>
      )}
    </div>
  );
}

export function DelBtn({ onClick, title = "Sil" }) {
  return (
    <button className="fa-btn" onClick={(e) => { e.stopPropagation(); onClick(e); }} title={title} style={{ background: "transparent", border: "none", color: V.ink3, cursor: "pointer", display: "flex", alignItems: "center", padding: 4, flexShrink: 0 }}>
      <Icon d="trash" size={16} />
    </button>
  );
}

export function EditBtn({ onClick, title = "Düzenle" }) {
  return (
    <button className="fa-btn" onClick={(e) => { e.stopPropagation(); onClick(e); }} title={title} style={{ background: "transparent", border: "none", color: V.ink3, cursor: "pointer", display: "flex", alignItems: "center", padding: 4, flexShrink: 0 }}>
      <Icon d="edit" size={15} />
    </button>
  );
}

export function Bos({ mesaj, baslik, icon = "doc" }) {
  return (
    <div className="fa-card" style={{ padding: "44px 20px", textAlign: "center" }}>
      <div style={{ width: 54, height: 54, borderRadius: "50%", margin: "0 auto 14px", background: V.track, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon d={icon} size={24} stroke={V.ink3} />
      </div>
      {baslik && <div style={{ fontSize: "14.5px", fontWeight: 600, color: V.ink, marginBottom: 5 }}>{baslik}</div>}
      <div style={{ fontSize: "13px", color: V.ink3 }}>{mesaj}</div>
    </div>
  );
}
