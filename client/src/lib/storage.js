const KEY = "swim-sessions";
const PROFILE_KEY = "swim-profile";
const PBS_KEY = "swim-pbs";

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

                      export function loadProfile() {
                        try {
                            return JSON.parse(localStorage.getItem(PROFILE_KEY));
                              } catch {
                                  return null;
                                    }
                                    }

                                    export function saveProfile(profile) {
                                      try {
                                          localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
                                            } catch {}
                                            }

                                            export function loadPbs() {
                                              try {
                                                  return JSON.parse(localStorage.getItem(PBS_KEY) || "{}");
                                                    } catch {
                                                        return {};
                                                          }
                                                          }

                                                          export function savePbs(pbs) {
                                                            try {
                                                                localStorage.setItem(PBS_KEY, JSON.stringify(pbs));
                                                                  } catch {}
                                                                  }
                                                                  