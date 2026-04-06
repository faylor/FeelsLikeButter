import { supabase } from "./supabase.js";

// --- Local fallback (used when not logged in) --------------------------------
const LOCAL_KEY = "swim-sessions-local";
export function loadLocalSessions() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
export function saveLocalSessions(s) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch {}
}

// --- Profile -----------------------------------------------------------------
export async function loadProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (!data) return null;
  return {
    name:     data.name,
    age:      data.age,
    gender:   data.gender,
    poolType: data.pool_type,
  };
}

export async function saveProfile(userId, profile) {
  await supabase.from("profiles").upsert({
    id:        userId,
    name:      profile.name,
    age:       profile.age,
    gender:    profile.gender,
    pool_type: profile.poolType,
    updated_at: new Date().toISOString(),
  });
}

// --- Personal bests ----------------------------------------------------------
export async function loadPbs(userId) {
  const { data } = await supabase
    .from("personal_bests")
    .select("event, time")
    .eq("user_id", userId);
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.event, r.time]));
}

export async function savePbs(userId, pbs) {
  const rows = Object.entries(pbs)
    .filter(([, t]) => t)
    .map(([event, time]) => ({
      user_id:    userId,
      event,
      time,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length > 0) {
    await supabase.from("personal_bests").upsert(rows, { onConflict: "user_id,event" });
  }
}

// --- Sessions ----------------------------------------------------------------
export async function loadSessions(userId) {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!data) return [];
  return data.map(r => ({
    id:          r.id,
    date:        r.created_at,
    stroke:      r.stroke,
    score:       r.score,
    note:        r.note,
    summary:     r.summary,
    topPriority: r.top_priority,
    items:       r.items,
    frames:      r.frames || [],
  }));
}

export async function saveSession(userId, session) {
  const { data, error } = await supabase.from("sessions").insert({
    user_id:      userId,
    stroke:       session.stroke,
    score:        session.score,
    note:         session.note,
    summary:      session.summary,
    top_priority: session.topPriority,
    items:        session.items,
    frames:       session.frames || null,  // [{preview, timestamp, tracked, angles}]
  }).select().single();
  if (error) throw error;
  return data.id;
}
