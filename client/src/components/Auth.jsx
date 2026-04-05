import { useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, Btn } from "./ui.jsx";
import { supabase } from "../lib/supabase.js";

export function Auth() {
  const [mode, setMode]       = useState("login"); // login | register | forgot
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [message, setMessage] = useState(null);

  const handleSubmit = async () => {
    setLoading(true); setError(null); setMessage(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for a confirmation link.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setMessage("Password reset email sent.");
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const inputStyle = {
    width: "100%", background: T.offWhite, border: `1px solid ${T.rule}`,
    padding: "12px 14px", fontSize: 14, color: T.dark,
    boxSizing: "border-box", outline: "none",
    fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    marginBottom: 12,
  };

  return (
    <div style={{ minHeight: "100vh", background: T.white, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px 80px" }}>

      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>
          <span style={{ display: "inline-block", animation: "roar 2.4s ease-in-out infinite" }}>
            <style>{`@keyframes roar { 0%{transform:scale(1) rotate(0deg)} 20%{transform:scale(1.35) rotate(-8deg)} 40%{transform:scale(1.4) rotate(6deg)} 60%{transform:scale(1.3) rotate(-4deg)} 80%{transform:scale(1.15) rotate(2deg)} 100%{transform:scale(1) rotate(0deg)} }`}</style>
            Tiger
          </span>
        </div>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", color: T.black }}>
          Tigers
        </div>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, marginTop: 6, letterSpacing: "0.06em" }}>
          Competitive Swimming Analysis
        </div>
      </div>

      <Rule style={{ marginBottom: 32 }} />

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: `1px solid ${T.rule}` }}>
        {[["login", "Sign in"], ["register", "Register"]].map(([m, l]) => (
          <button key={m} onClick={() => { setMode(m); setError(null); setMessage(null); }} style={{
            flex: 1, padding: "10px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
            fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
            color: mode === m ? T.dark : T.muted,
            borderBottom: `2px solid ${mode === m ? T.dark : "transparent"}`,
            marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {/* Fields */}
      <div>
        <Label style={{ marginBottom: 6 }}>Email</Label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@email.com" style={inputStyle}
        />

        {mode !== "forgot" && (
          <>
            <Label style={{ marginBottom: 6 }}>Password</Label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Choose a password" : "Your password"}
              style={inputStyle}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </>
        )}

        {error && (
          <div style={{ padding: "10px 14px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 14, fontSize: 12, color: T.red, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ padding: "10px 14px", background: "#EBF7F4", borderLeft: `3px solid #007A5E`, marginBottom: 14, fontSize: 12, color: "#007A5E", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}>
            {message}
          </div>
        )}

        <Btn onClick={handleSubmit} style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? "none" : "auto", marginBottom: 16 }}>
          {loading ? "..." : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset email"}
        </Btn>

        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, textAlign: "center", letterSpacing: "0.04em" }}>
            Forgot password?
          </button>
        )}
        {mode === "forgot" && (
          <button onClick={() => { setMode("login"); setError(null); setMessage(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, textAlign: "center", letterSpacing: "0.04em" }}>
            &larr; Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
