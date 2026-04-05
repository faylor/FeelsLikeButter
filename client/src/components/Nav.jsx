import { T } from "../tokens.js";

const NAV_ITEMS = [
  { id: "home",    label: "Home"    },
    { id: "analyze", label: "Analyze" },
      { id: "history", label: "History" },
        { id: "targets", label: "Targets" },
          { id: "report",  label: "Report"  },
          ];

          const buildDate = typeof __BUILD_DATE__ !== "undefined"
            ? new Date(__BUILD_DATE__).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "dev";

              export function Nav({ view, accentColor, onNavigate }) {
                return (
                    <div style={{
                          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
                                width: "100%", maxWidth: 480, background: T.white,
                                      borderTop: `1px solid ${T.rule}`, zIndex: 100,
                                          }}>
                                                {/* Build date */}
                                                      <div style={{
                                                              textAlign: "center", padding: "4px 0",
                                                                      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                                                                              fontSize: 9, color: T.rule, letterSpacing: "0.08em",
                                                                                      borderBottom: `1px solid ${T.rule}`,
                                                                                            }}>
                                                                                                    BUILD {buildDate}
                                                                                                          </div>

                                                                                                                {/* Nav buttons */}
                                                                                                                      <div style={{ display: "flex" }}>
                                                                                                                              {NAV_ITEMS.map((n) => (
                                                                                                                                        <button key={n.id} onClick={() => onNavigate(n.id)} style={{
                                                                                                                                                    flex: 1, padding: "12px 4px 10px", background: "none", border: "none",
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
                                                                                                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                                                            