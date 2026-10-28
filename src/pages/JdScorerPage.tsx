import { useState } from "react";
import { supabase } from "../lib/supabase";
import { inputCls } from "@/components/ui/styles";
import { useProfile } from "@/features/profile/profileContext";
import { errorMessage } from "../lib/utils";

/* ── Types ─────────────────────────────────────────────────────── */

interface ScoreSection {
  name: string;
  score: number;
  feedback: string;
}

interface ScoreResult {
  overall_score: number;
  label: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  sections: ScoreSection[];
}

interface Props {
  /** The "upload a resume first" empty state links here. */
  onGoToSettings: () => void;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function scoreTextColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBarColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function labelStyle(label: string) {
  if (label === "Excellent Match" || label === "Strong Match")
    return "bg-emerald-500/[0.12] text-emerald-400";
  if (label === "Good Match") return "bg-yellow-500/[0.12] text-yellow-400";
  return "bg-red-500/[0.12] text-red-400";
}

/* ── Circular score ring ────────────────────────────────────────── */
function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#facc15" : "#f87171";

  return (
    <svg className="h-28 w-28" viewBox="0 0 100 100">
      {/* Track */}
      <circle
        cx="50" cy="50" r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="8"
      />
      {/* Progress */}
      <circle
        cx="50" cy="50" r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 1s ease-out", filter: `drop-shadow(0 0 8px ${color}66)` }}
      />
      {/* Score text */}
      <text x="50" y="46" textAnchor="middle" fill={color} fontSize="22" fontWeight="bold" fontFamily="Inter, ui-sans-serif">
        {score}
      </text>
      <text x="50" y="60" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="Inter, ui-sans-serif">
        / 100
      </text>
    </svg>
  );
}

/* ── Component ──────────────────────────────────────────────────── */

export default function JdScorerPage({ onGoToSettings }: Props) {
  const { profile } = useProfile();
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resumeText = profile?.resume_text?.trim() ?? "";
  const hasResume = resumeText.length > 0;

  async function scoreJd() {
    if (!jdText.trim() || !hasResume) return;

    setLoading(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("score-jd", {
        body: {
          resume_text: resumeText,
          jd_text: jdText.trim(),
        },
      });

      if (fnError) throw new Error(fnError.message);
      const fnErr = (data as { error?: string } | null)?.error;
      if (fnErr) throw new Error(fnErr);

      setResult(data as ScoreResult);
    } catch (e) {
      setErrorMsg(errorMessage(e, "Scoring failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6 [&>*]:max-w-3xl">

      {/* ── Resume status card ── */}
      {hasResume ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-glow/20 bg-glow/[0.04] px-4 py-3.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-glow/10">
            <svg className="h-4 w-4 text-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80">Resume loaded</p>
            <p className="text-xs text-white/35 mt-0.5">
              {resumeText.split(/\s+/).length.toLocaleString()} words · uploaded from your profile
            </p>
          </div>
          <svg className="h-4 w-4 flex-shrink-0 text-glow/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        /* No resume — prompt to go to settings */
        <div className="mb-6 rounded-xl border border-danger/20 bg-danger/[0.04] px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 mt-0.5">
              <svg className="h-5 w-5 text-danger/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white/80">No resume on file</p>
              <p className="text-xs text-white/40 mt-1 leading-relaxed">
                A resume is required to use Job Description Comparison. Upload a PDF resume in Settings to get started.
              </p>
              <button
                onClick={onGoToSettings}
                className="mt-3 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.10] hover:text-white cursor-pointer"
              >
                Go to Settings →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── JD input ── */}
      <div className="mb-4">
        <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/30">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Job Description
        </label>
        <textarea
          className={`${inputCls} h-56 resize-y`}
          placeholder="Paste the full job description here — role requirements, qualifications, responsibilities..."
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          disabled={!hasResume}
        />
      </div>

      {/* ── CTA ── */}
      <button
        onClick={scoreJd}
        disabled={loading || !jdText.trim() || !hasResume}
        className="w-full rounded-xl bg-glow py-3 text-sm font-semibold text-depth-0 transition duration-300 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing your fit…
          </span>
        ) : (
          "Compare to My Resume"
        )}
      </button>

      {/* ── Error ── */}
      {errorMsg && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="mt-8 space-y-4">

          {/* Overall score card */}
          <div className="rounded-xl border border-white/[0.06] bg-depth-1/80 p-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
              <ScoreRing score={result.overall_score} />
              <div className="flex-1 text-center sm:text-left">
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${labelStyle(result.label)}`}>
                  {result.label}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{result.summary}</p>
              </div>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="rounded-xl border border-white/[0.06] bg-depth-1/80 p-5">
            <h3 className="mb-4 text-xs font-semibold text-white/30">
              Score Breakdown
            </h3>
            <div className="space-y-5">
              {result.sections.map((sec) => (
                <div key={sec.name}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">{sec.name}</span>
                    <span className={`text-sm font-bold tabular-nums ${scoreTextColor(sec.score)}`}>
                      {sec.score}
                    </span>
                  </div>
                  <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full transition duration-1000 ${scoreBarColor(sec.score)}`}
                      style={{ width: `${sec.score}%` }}
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-white/35">{sec.feedback}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths & Gaps */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-depth-1/80 p-5">
              <h3 className="mb-3 text-xs font-semibold text-emerald-400/60">
                Strengths
              </h3>
              <ul className="space-y-2.5">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                    <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/50" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-depth-1/80 p-5">
              <h3 className="mb-3 text-xs font-semibold text-red-400/60">
                Gaps to Address
              </h3>
              <ul className="space-y-2.5">
                {result.gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                    <span className="mt-0.5 flex-shrink-0 text-red-400/80">↑</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-xs text-white/20">
            Paste a different job description above to compare another role.
          </p>
        </div>
      )}
    </div>
  );
}
