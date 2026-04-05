import { useState, useEffect } from "react";
import { T } from "./tokens.js";
import { STROKE_CHECKLISTS } from "./constants/strokes.js";
import { loadSessions, saveSession, loadProfile, saveProfile, loadPbs, savePbs } from "./lib/storage.js";
import { extractFrames } from "./lib/video.js";
import { analyzeWithClaude } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";
import { Auth }          from "./components/Auth.jsx";
import { HomeView }      from "./components/HomeView.jsx";
import { AnalyzeView }   from "./components/AnalyzeView.jsx";
import { HistoryView }   from "./components/HistoryView.jsx";
import { TargetsView }   from "./components/TargetsView.jsx";
import { ProfileSetup }  from "./components/ProfileSetup.jsx";
import { TimingAnalysis } from "./components/TimingAnalysis.jsx";
import { Nav }           from "./components/Nav.jsx";

export default function App() {
  // -- Auth ------------------------------------------------------------------
  const [authUser, setAuthUser]   = useState(undefined); // undefined = loading
  const [authToken, setAuthToken] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthToken(session?.access_token ?? null);
    });
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthToken(session?.access_token ?? null);
      if (!session) {
        // Clear data on logout
        setSessions([]); setProfile(null); setPbs({});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load user data when auth is established
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
  const [step, setStep]             = useState("upload");
  const [crop, setCrop]             = useState(null);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [analysedFrames, setAnalysedFrames] = useState([]); // annotated frames shown post-analysis
  const [sessions, setSessions]     = useState([]);
  const [note, setNote]             = useState("");
  const [profile, setProfile]       = useState(null);
  const [pbs, setPbs]               = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const [extractProgress, setExtractProgress] = useState(null);
  const [frameCount, setFrameCount] = useState(30);

  const accentColor = T.strokes[stroke].accent;

  // -- Helper: auth header for API calls ------------------------------------
  const authHeaders = () => authToken
    ? { "Authorization": `Bearer ${authToken}` }
    : {};

  // -- Analysis flow ---------------------------------------------------------
  const handleLaneConfirm = (selectedCrop) => {
    setCrop(selectedCrop); setStep("privacy");
  };

  const handlePrivacyConfirm = async (zones) => {
    setStep("analyzing"); setExtractProgress(null); setError(null);
    try {
      const frames = await extractFrames(
        videoFile, zones, frameCount, crop,
        (done, total) => setExtractProgress({ done, total }),
        false,
        stroke  // enables MediaPipe pose annotation
      );
      setExtractProgress(null);
      const r = await analyzeWithClaude(frames, stroke, STROKE_CHECKLISTS[stroke]);
      setAnalysedFrames(frames);
      setResult(r); setStep("result");
    } catch (e) {
      setError(`Analysis failed -- ${e.message}`);
      setExtractProgress(null); setStep("upload");
    }
  };

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
    setNote(""); setResult(null); setVideoFile(null); setCrop(null);
    setAnalysedFrames([]);
    setStep("upload"); setView("history");
  };

  // -- Profile save ----------------------------------------------------------
  const handleProfileSave = async ({ profile: p, pbs: b }) => {
    setProfile(p); setPbs(b);
    if (authUser) {
      await saveProfile(authUser.id, p);
      await savePbs(authUser.id, b);
    }
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
    if (id === "analyze" && step === "result") setStep("upload");
    if (id === "analyze" && step === "timing") setStep("upload");
  };

  const handleStrokeSelect = (s) => { setStroke(s); setView("analyze"); };

  // -- Loading splash --------------------------------------------------------
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
          extractProgress={extractProgress}
          frameCount={frameCount} setFrameCount={setFrameCount}
          analysedFrames={analysedFrames}
          onLaneConfirm={handleLaneConfirm}
          onPrivacyConfirm={handlePrivacyConfirm}
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
