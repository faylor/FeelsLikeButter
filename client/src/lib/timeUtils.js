// ─── Parse "M:SS.ss" or "SS.ss" string → total seconds ───────────────────────
export function parseTime(str) {
  if (!str) return null;
    const s = str.trim();
      if (s.includes(":")) {
          const [mins, secs] = s.split(":");
              return parseInt(mins, 10) * 60 + parseFloat(secs);
                }
                  return parseFloat(s);
                  }

                  // ─── Format total seconds → "M:SS.ss" or "SS.ss" ─────────────────────────────
                  export function formatTime(secs) {
                    if (secs == null || isNaN(secs)) return "—";
                      if (secs >= 60) {
                          const m  = Math.floor(secs / 60);
                              const s  = (secs - m * 60).toFixed(2).padStart(5, "0");
                                  return `${m}:${s}`;
                                    }
                                      return secs.toFixed(2);
                                      }

                                      // ─── Gap in seconds (positive = faster needed, negative = already under) ──────
                                      export function gap(pbSecs, targetSecs) {
                                        if (!pbSecs || !targetSecs) return null;
                                          return pbSecs - targetSecs;
                                          }

                                          // ─── Status for a swimmer's PB vs a target time ───────────────────────────────
                                          // Returns: "qualifies" | "consideration" | "close" | "working"
                                          export function getStatus(pbSecs, qualSecs, consSecs) {
                                            if (!pbSecs) return "none";
                                              if (pbSecs <= qualSecs) return "qualifies";
                                                if (pbSecs <= consSecs) return "consideration";
                                                  if (pbSecs <= consSecs * 1.05) return "close";   // within 5% of consideration
                                                    return "working";
                                                    }

                                                    // ─── Required average split per 50m ──────────────────────────────────────────
                                                    export function requiredSplit50(targetSecs, distanceMetres) {
                                                      if (!targetSecs || !distanceMetres) return null;
                                                        const splits = distanceMetres / 50;
                                                          return targetSecs / splits;
                                                          }

                                                          // ─── Flip turn impact ─────────────────────────────────────────────────────────
                                                          // turnCount: number of turns in the event
                                                          // currentTurnSecs: estimated current turn time (wall contact to 5m mark)
                                                          // targetTurnSecs: target turn time
                                                          // Returns seconds saved if turns improve to target
                                                          export function flipTurnSaving(turnCount, currentTurnSecs, targetTurnSecs) {
                                                            if (!turnCount || !currentTurnSecs || !targetTurnSecs) return 0;
                                                              return turnCount * Math.max(0, currentTurnSecs - targetTurnSecs);
                                                              }

                                                              // ─── Age group key from numeric age ──────────────────────────────────────────
                                                              export function ageGroupKey(age) {
                                                                if (age <= 11) return "10/11";
                                                                  if (age <= 17) return String(age);
                                                                    return "18+";
                                                                    }
                                                                    