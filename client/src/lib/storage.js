const KEY = "swim-sessions";

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {}
}
