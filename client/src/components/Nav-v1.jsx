import { T } from "../tokens.js";

const NAV_ITEMS = [
  { id: "home",    label: "Home"    },
    { id: "analyze", label: "Analyze" },
      { id: "history", label: "History" },
        { id: "targets", label: "Targets" },
          { id: "report",  label: "Report"  },
          ];

          export function Nav({ view, accentColor, onNavigate }) {
            return (
                <div style={{
                      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
                            width: "100%", maxWidth: 480, background: T.white,
                                  borderTop: `1px solid ${T.rule}`, display: "flex", zIndex: 100,
                                      }}>
                                            {NAV_ITEMS.map((n) => (
                                                    <button key={n.id} onClick={() => onNavigate(n.id)} style={{
                                                              flex: 1, padding: "14px 4px 12px", background: "none", border: "none",
                                                                        cursor: "pointer", borderTop: `2px solid ${view === n.id ? accentColor : "transparent"}`,
                                                                                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                                                                                            transition: "border-color 0.15s",
                                                                                                    }}>
                                                                                                              <span style={{
                                                                                                                          fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                                                                                                                                      fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
                                                                                                                                                  color: view === n.id ? accentColor : T.muted,
                                                                                                                                                            }}>
                                                                                                                                                                        {n.label}
                                                                                                                                                                                  </span>
                                                                                                                                                                                          </button>
                                                                                                                                                                                                ))}
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                      );
                                                                                                                                                                                                      }
                                                                                                                                                                                                      