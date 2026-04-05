import { useState } from "react";
import { T } from "./tokens.js";
import { STROKE_CHECKLISTS } from "./constants/strokes.js";
import { loadSessions, saveSessions, loadProfile, saveProfile, loadPbs, savePbs } from "./lib/storage.js";
import { extractFrames } from "./lib/video.js";
import { analyzeWithClaude } from "./lib/api.js";
import { HomeView }    from "./components/HomeView.jsx";
import { AnalyzeView } from "./components/AnalyzeView.jsx";
import { HistoryView } from "./components/HistoryView.jsx";
import { ReportView }  from "./components/ReportView.jsx";
import { TargetsView } from "./components/TargetsView.jsx";
import { ProfileSetup } from "./components/ProfileSetup.jsx";
import { Nav }         from "./components/Nav.jsx";

export default function App() {
  const [view, setView]           = useState("home");
  const [stroke, setStroke]       = useState("Freestyle");
  const [videoFile, setVideoFile] = useState(null);
  const [step, setStep]           = useState("upload");
  const [crop, setCrop]           = useState(null);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [sessions, setSessions]   = useState(() => loadSessions());
  const [note, setNote]           = useState("");
  const [profile, setProfile]     = useState(() => loadProfile());
  const [pbs, setPbs]             = useState(() => loadPbs());
  const [showProfile, setShowProfile] = useState(false);

  const accentColor = T.strokes[stroke].accent;

  // ── Analysis flow ──────────────────────────────────────────────────────────
  const handleLaneConfirm = (selectedCrop) => {
    setCrop(selectedCrop);
    setStep("privacy");
  };

  const handlePrivacyConfirm = async (zones) => {
    setStep("analyzing");
    setError(null);
    try {
      const frames = await extractFrames(videoFile, zones, 4, crop);
      const r = await analyzeWithClaude(frames, stroke, STROKE_CHECKLISTS[stroke]);
      setResult(r);
      setStep("result");
    } catch (e) {
      setError(`Analysis failed — ${e.message}`);
      setStep("upload");
    }
  };

  const handleSave = () => {
    if (!result) return;
    const session = {
      id:          Date.now(),
      date:        new Date().toISOString(),
      stroke,
      score:       result.overallScore,
      note,
      summary:     result.summary,
      topPriority: result.topPriority,
      items:       result.items,
    };
    const updated = [session, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setNote("");
    setResult(null);
    setVideoFile(null);
    setCrop(null);
    setStep("upload");
    setView("history");
  };

  // ── Profile save ───────────────────────────────────────────────────────────
  const handleProfileSave = ({ profile: p, pbs: b }) => {
    setProfile(p);
    saveProfile(p);
    setPbs(b);
    savePbs(b);
    setShowProfile(false);
    setView("targets");
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNavigate = (id) => {
    setView(id);
    // Reset analyze flow when leaving the view
    if (id === "analyze" && step === "result") setStep("upload");
  };

  const handleStrokeSelect = (s) => {
    setStroke(s);
    setView("analyze");
  };

  // ── Profile setup overlay ──────────────────────────────────────────────────
  if (showProfile) {
    return (
      <div style={{ minHeight: "100vh", background: T.white, maxWidth: 480, margin: "0 auto" }}>
        <ProfileSetup
          profile={profile}
          pbs={pbs}
          onSave={handleProfileSave}
          onCancel={profile ? () => setShowProfile(false) : null}
        />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.white, maxWidth: 480, margin: "0 auto", paddingBottom: 72 }}>
      {view === "home" && (
        <HomeView
          sessions={sessions}
          onAnalyze={() => setView("analyze")}
          onReport={() => setView("report")}
          onStrokeSelect={handleStrokeSelect}
        />
      )}

      {view === "analyze" && (
        <AnalyzeView
          stroke={stroke}
          setStroke={setStroke}
          videoFile={videoFile}
          setVideoFile={setVideoFile}
          step={step}
          setStep={setStep}
          result={result}
          error={error}
          note={note}
          setNote={setNote}
          onLaneConfirm={handleLaneConfirm}
          onPrivacyConfirm={handlePrivacyConfirm}
          onSave={handleSave}
        />
      )}

      {view === "history" && <HistoryView sessions={sessions} />}
      {view === "targets" && (
        <TargetsView
          profile={profile}
          pbs={pbs}
          onSetupProfile={() => setShowProfile(true)}
        />
      )}
      {view === "report"  && <ReportView  sessions={sessions} />}

      <Nav view={view} accentColor={accentColor} onNavigate={handleNavigate} />
    </div>
  );
}