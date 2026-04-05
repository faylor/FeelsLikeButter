import { useRef, useState } from "react";
import { T } from "../tokens.js";
import { Rule, Label, ScoreRing, StatusMark, ThinBar, StrokeChip, Btn } from "./ui.jsx";
import { PrivacyEditor } from "./PrivacyEditor.jsx";
import { LaneSelector } from "./LaneSelector.jsx";
import { TechniqueExample } from "./TechniqueExample.jsx";

// --- Analyzing spinner --------------------------------------------------------
function AnalyzingScreen() {
  return (
    <div style={{ padding: "80px 24px", textAlign: "center" }}>
      <div style={{ width: 32, height: 1, background: T.dark, margin: "0 auto 32px" }} />
      <Label style={{ display: "block", marginBottom: 8, color: T.black }}>Analyzing</Label>
      <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.muted, lineHeight: 1.8, margin: 0 }}>
        Extracting frames · Applying face blur<br />Sending to AI coach
      </p>
      <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#007A5E" }} />
        <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: "#007A5E", letterSpacing: "0.06em" }}>
          Faces obscured before upload
        </span>
      </div>
    </div>
  );
}

// --- Result panel -------------------------------------------------------------
function ResultPanel({ result, stroke, note, onNoteChange, onSave }) {
  const sc = T.strokes[stroke];
  const [exampleItem, setExampleItem] = useState(null);

  return (
    <div>
      {/* Technique example modal */}
      {exampleItem && (
        <TechniqueExample
          item={exampleItem}
          stroke={stroke}
          accent={sc.accent}
          onClose={() => setExampleItem(null)}
        />
      )}

      <Rule style={{ marginBottom: 24 }} />

      {/* Score + summary */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 24 }}>
        <ScoreRing score={result.overallScore} />
        <div style={{ flex: 1 }}>
          <Label style={{ color: sc.accent, marginBottom: 4 }}>{stroke}</Label>
          <p style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 13, color: T.mid, lineHeight: 1.6, margin: "0 0 12px" }}>
            {result.summary}
          </p>
          <div style={{ padding: "10px 14px", background: sc.light, borderLeft: `2px solid ${sc.accent}` }}>
            <Label style={{ marginBottom: 4, color: sc.accent }}>Top priority</Label>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.dark, lineHeight: 1.5 }}>
              {result.topPriority}
            </div>
          </div>
          {result.competitionNote && (
            <div style={{ marginTop: 10, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, fontStyle: "italic" }}>
              {result.competitionNote}
            </div>
          )}
        </div>
      </div>

      <Rule style={{ marginBottom: 20 }} />

      {/* Technique breakdown */}
      <Label style={{ marginBottom: 16 }}>Technique breakdown</Label>
      {result.items?.map((item, i) => (
        <div key={i} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: i < result.items.length - 1 ? `1px solid ${T.rule}` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
            <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, lineHeight: 1.4, flex: 1 }}>
              {item.name}
            </div>
            <StatusMark status={item.status} />
          </div>
          <ThinBar value={item.score} color={item.status === "good" ? "#007A5E" : item.status === "warning" ? "#C4610A" : T.red} />
          <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid, marginTop: 8, lineHeight: 1.5 }}>
            {item.feedback}
          </div>
          {item.status !== "good" && item.drill && (
            <div style={{ marginTop: 8, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: sc.accent }}>
              Drill — {item.drill}
            </div>
          )}
          {/* Show example button — only on flagged items */}
          {item.status !== "good" && (
            <button
              onClick={() => setExampleItem(item)}
              style={{
                marginTop: 10, background: "none",
                border: `1px solid ${T.rule}`, color: T.mid,
                padding: "5px 12px", fontSize: 11, cursor: "pointer",
                fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
                letterSpacing: "0.06em",
              }}>
              See good vs bad example →
            </button>
          )}
        </div>
      ))}

      <Rule style={{ margin: "8px 0 20px" }} />

      {/* Save */}
      <Label style={{ marginBottom: 10 }}>Session note</Label>
      <input value={note} onChange={(e) => onNoteChange(e.target.value)}
        placeholder="e.g. after hard practice, fresh warm-up"
        style={{ width: "100%", background: T.offWhite, border: `1px solid ${T.rule}`, padding: "12px 14px", fontSize: 12, color: T.dark, boxSizing: "border-box", marginBottom: 14, outline: "none", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}
      />
      <Btn onClick={onSave}>Save Session</Btn>
    </div>
  );
}

// --- Upload step --------------------------------------------------------------
function UploadStep({ stroke, videoFile, error, onStrokeChange, onFileChange, onContinue }) {
  const fileRef = useRef();
  const sc = T.strokes[stroke];

  return (
    <div style={{ padding: "0 24px" }}>
      {/* File picker */}
      <div onClick={() => fileRef.current?.click()}
        style={{ border: `1px solid ${videoFile ? sc.accent : T.rule}`, padding: "28px 20px", cursor: "pointer", marginBottom: 20, background: videoFile ? sc.light : T.offWhite, textAlign: "center" }}>
        <input ref={fileRef} type="file" accept="video/*" onChange={onFileChange} style={{ display: "none" }} />
        {videoFile
          ? <>
              <div style={{ fontSize: 11, fontWeight: 500, color: sc.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Video selected</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.mid }}>{videoFile.name}</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted, marginTop: 6 }}>Tap to change</div>
            </>
          : <>
              <div style={{ fontSize: 24, color: T.muted, marginBottom: 10 }}>+</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark, marginBottom: 4 }}>Select video</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>MP4 or MOV · Poolside angle</div>
            </>}
      </div>

      {/* Privacy steps */}
      <div style={{ marginBottom: 24 }}>
        <Label style={{ marginBottom: 12 }}>Privacy process</Label>
        {[
          ["01", "Select your swimmer",  "draw a box around him"],
          ["02", "Faces auto-blurred",   "browser AI, no upload"],
          ["03", "Draw extra zones",     "full manual control"],
          ["04", "AI sees only his crop","other lanes ignored"],
        ].map(([n, t, s]) => (
          <div key={n} style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
            <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 10, color: T.muted, letterSpacing: "0.05em", paddingTop: 2, width: 16, flexShrink: 0 }}>{n}</span>
            <div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, fontWeight: 500, color: T.dark }}>{t}</div>
              <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 11, color: T.muted }}>{s}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#FFF0F0", borderLeft: `3px solid ${T.red}`, marginBottom: 16, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 12, color: T.red }}>
          {error}
        </div>
      )}

      {videoFile && (
        <Btn onClick={onContinue} accent={sc.accent}>
          Select Swimmer →
        </Btn>
      )}
    </div>
  );
}

// --- AnalyzeView --------------------------------------------------------------
export function AnalyzeView({ stroke, setStroke, videoFile, setVideoFile, step, setStep, result, error, note, setNote, onLaneConfirm, onPrivacyConfirm, onSave }) {
  const sc = T.strokes[stroke];

  if (step === "select") {
    return <LaneSelector videoFile={videoFile} onConfirm={onLaneConfirm} onBack={() => setStep("upload")} accent={sc.accent} />;
  }
  if (step === "privacy") {
    return <PrivacyEditor videoFile={videoFile} onConfirm={onPrivacyConfirm} onBack={() => setStep("select")} accent={sc.accent} />;
  }
  if (step === "analyzing") return <AnalyzingScreen />;

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "32px 24px 20px" }}>
        <Label style={{ marginBottom: 6, color: sc.accent }}>New Analysis</Label>
        <div style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", color: T.black, marginBottom: 20 }}>
          Upload &amp; Review
        </div>
        <Rule />
      </div>

      {/* Stroke selector */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.rule}`, marginBottom: 24 }}>
        {Object.keys(T.strokes).map((s) => (
          <StrokeChip key={s} stroke={s} active={stroke === s} onClick={() => setStroke(s)} />
        ))}
      </div>

      <UploadStep
        stroke={stroke}
        videoFile={videoFile}
        error={error}
        onStrokeChange={setStroke}
        onFileChange={(e) => { const f = e.target.files?.[0]; if (f) setVideoFile(f); }}
        onContinue={() => setStep("select")}
      />

      {step === "result" && result && (
        <div style={{ padding: "0 24px" }}>
          <ResultPanel result={result} stroke={stroke} note={note} onNoteChange={setNote} onSave={onSave} />
        </div>
      )}
    </div>
  );
}
