import { useState, useEffect } from "react";
import { T } from "./tokens.js";
import { STROKE_CHECKLISTS } from "./constants/strokes.js";
import { loadSessions, saveSession, loadProfile, saveProfile, loadPbs, savePbs } from "./lib/storage.js";
import { extractTrackedFrames } from "./lib/video.js";
import { analyzeWithClaude } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";
import { Auth }          from "./components/Auth.jsx";
import { HomeView }      from "./components/HomeView.jsx";
import { AnalyzeView }   from "./components/AnalyzeView.jsx";
import { HistoryView }   from "./components/HistoryView.jsx";
import { TargetsView }   from "./components/TargetsView.jsx";
import { ProfileSetup }  from "./components/ProfileSetup.jsx";
import { TimingAnalysis } from "./components/TimingAnalysis.jsx";
import { VideoPreview }  from "./components/VideoPreview.jsx";
import { Nav }           from "./components/Nav.jsx";

export default function App() {
  // -- Auth ------------------------------------------------------------------
  const [authUser, setAuthUser]   = useState(undefined);
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthToken(session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUser(session?.user ?? null);
      setAuthToken(session?.access_token ?? null);
      if (!session) { setSessions([]); setProfile(null); setPbs({}); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser.id).then(p => { if (p) setProfile(p); });
    loadPbs(authUser.id).then(b => { if (b) setPbs(b); });
    loadSessions(authUser.id).then(s => { if (s) setSessions(s); });
  }, [authUser]);

  // -- App state -------------------------------------------------------------
  const [view, setView]             = useState("home");
  const [stroke, setStroke]         = useState("Freestyle");
  const [videoFile, setVideoFile]   = useState(null);
  // steps: upload | select | privacy | processing | review | analyzing | result
  const [step, setStep]             = useState("upload");
  const [crop, setCrop]             = useState(null);
  const [privacyZones, setPrivacyZones] = useState([]);
  const [previewTimes, setPreviewTimes] = useState(null); // confirmed good timestamps
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [note, setNote]             = useState("");
  const [profile, setProfile]       = useState(null);
  const [pbs, setPbs]               = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const [processProgress, setProcessProgress] = useState(null);
  const [frameCount, setFrameCount] = useState(30);
  const [processedFrames, setProcessedFrames] = useState([]); // all tracked frames
  const [approvedFrames, setApprovedFrames]   = useState([]); // user-approved subset

  const accentColor = T.strokes[stroke].accent;

  // -- Lane confirm ----------------------------------------------------------
  const handleLaneConfirm = (selectedCrop) => {
    setCrop(selectedCrop); setStep("privacy");
  };

  // -- Privacy confirm: go to preview step ----------------------------------
  const handlePrivacyConfirm = async (zones) => {
    setPrivacyZones(zones);
    setStep("preview");
  };

  // -- Preview confirmed: start full processing -----------------------------
  const handlePreviewConfirm = async (goodTimes) => {
    setPreviewTimes(goodTimes);
    setStep("processing");
    setProcessProgress(null);
    setError(null);
    try {
      const frames = await extractTrackedFrames(
        videoFile, crop, privacyZones,
        0.5, stroke,
        (done, total, phase) => setProcessProgress({ done, total, phase })
      );
      setProcessedFrames(frames);
      setProcessProgress(null);
      setStep("review");
    } catch (e) {
      setError(`Processing failed -- ${e.message}`);
      setProcessProgress(null);
      setStep("upload");
    }
  };

  // -- User approves frames: send to Claude ---------------------------------
  const handleReviewConfirm = async (approved) => {
    setApprovedFrames(approved);
    setStep("analyzing");
    setError(null);
    try {
      const base64Frames = approved.map(f => f.data);
      const r = await analyzeWithClaude(base64Frames, stroke, STROKE_CHECKLISTS[stroke]);
      setResult(r);
      setStep("result");
    } catch (e) {
      setError(`Analysis failed -- ${e.message}`);
      setStep("review");
    }
  };

  // -- Save session ----------------------------------------------------------
  const handleSave = async () => {
    if (!result || !authUser) return;
    const session = {
      stroke, score: result.overallScore, note,
      summary: result.summary, topPriority: result.topPriority, items: result.items,
    };
    try {
      await saveSession(authUser.id, session);
      const updated = await loadSessions(authUser.id);
      setSessions(updated);
    } catch (e) { console.error("Save failed:", e); }
    // Reset
    setNote(""); setResult(null); setVideoFile(null);
    setCrop(null); setPrivacyZones([]); setProcessedFrames([]);
    setApprovedFrames([]); setStep("upload"); setView("history");
  };

  // -- Profile save ----------------------------------------------------------
  const handleProfileSave = async ({ profile: p, pbs: b }) => {
    setProfile(p); setPbs(b);
    if (authUser) { await saveProfile(authUser.id, p); await savePbs(authUser.id, b); }
    setShowProfile(false); setView("targets");
  };

  // -- Browser back button ---------------------------------------------------
  useEffect(() => {
    if (showProfile) window.history.pushState({ showProfile: true }, "");
  }, [showProfile]);

  useEffect(() => {
    const onPop = () => { if (showProfile) setShowProfile(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showProfile]);

  // -- Navigation ------------------------------------------------------------
  const handleNavigate = (id) => {
    setView(id);
    if (id === "analyze" && ["result","review","processing"].includes(step)) setStep("upload");
  };

  const handleStrokeSelect = (s) => { setStroke(s); setView("analyze"); };

  // -- Loading ---------------------------------------------------------------
  if (authUser === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: T.white, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Loading...
        </div>
      </div>
    );
  }

  // -- Auth gate -------------------------------------------------------------
  if (!authUser) return <Auth />;

  // -- Profile overlay -------------------------------------------------------
  if (showProfile) {
    return (
      <div style={{ minHeight: "100vh", background: T.white, maxWidth: 480, margin: "0 auto" }}>
        <ProfileSetup
          profile={profile} pbs={pbs}
          onSave={handleProfileSave}
          onCancel={() => setShowProfile(false)}
        />
      </div>
    );
  }

  // -- Main app --------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: T.white, maxWidth: 480, margin: "0 auto", paddingBottom: 72 }}>
      {view === "home" && (
        <HomeView
          sessions={sessions}
          onAnalyze={() => setView("analyze")}
          onReport={() => setView("report")}
          onStrokeSelect={handleStrokeSelect}
          user={authUser}
          onSignOut={() => supabase.auth.signOut()}
        />
      )}
      {view === "analyze" && (
        <AnalyzeView
          stroke={stroke} setStroke={setStroke}
          videoFile={videoFile} setVideoFile={setVideoFile}
          step={step} setStep={setStep}
          result={result} error={error}
          note={note} setNote={setNote}
          processProgress={processProgress}
          processedFrames={processedFrames}
          approvedFrames={approvedFrames}
          crop={crop}
          privacyZones={privacyZones}
          onLaneConfirm={handleLaneConfirm}
          onPrivacyConfirm={handlePrivacyConfirm}
          onPreviewConfirm={handlePreviewConfirm}
          onReviewConfirm={handleReviewConfirm}
          onReviewBack={() => setStep("privacy")}
          onSave={handleSave}
          profile={profile} pbs={pbs}
        />
      )}
      {view === "history" && <HistoryView sessions={sessions} />}
      {view === "targets" && (
        <TargetsView
          profile={profile} pbs={pbs}
          sessions={sessions}
          onSetupProfile={() => setShowProfile(true)}
        />
      )}
      {view === "timing" && (
        <TimingAnalysis
          stroke={stroke} profile={profile} pbs={pbs}
          onBack={() => setView("home")}
        />
      )}

      <Nav view={view} accentColor={accentColor} onNavigate={handleNavigate} />
    </div>
  );
}
