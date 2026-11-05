import type { ReactNode } from "react";
import { inputCls } from "@/components/ui/styles";
import {
  STAGE_LABELS,
  STAGES,
  type ReviewQuestion,
  type ReviewResult,
  type Stage,
} from "../../../supabase/functions/_shared/resumeReview.ts";

/* Presentational pieces for the Resume review page. No data fetching in here, so the page
   test can render each step from plain props. */

const card = "rounded-xl border border-white/[0.06] bg-depth-1/80";
const eyebrow = "text-xs font-semibold text-white/40";

function ratioColor(ratio: number) {
  return ratio >= 0.8 ? "bg-emerald-500" : ratio >= 0.6 ? "bg-yellow-500" : "bg-red-500";
}
function ratioText(ratio: number) {
  return ratio >= 0.8 ? "text-emerald-400" : ratio >= 0.6 ? "text-yellow-400" : "text-red-400";
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export const primaryBtn =
  "w-full rounded-xl bg-glow py-3 text-sm font-semibold text-depth-0 transition duration-300 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";
export const quietBtn =
  "rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.10] hover:text-white cursor-pointer";

/* ── Step 0: who and what ────────────────────────────────────────── */

export interface IntakeValues {
  stage: Stage;
  targetTitle: string;
  jobPosting: string;
  pastedResume: string;
}

export function IntakeForm(props: {
  values: IntakeValues;
  hasProfileResume: boolean;
  resumeWords: number;
  busy: boolean;
  onChange: (next: IntakeValues) => void;
  onSubmit: () => void;
  onGoToSettings: () => void;
}) {
  const { values, hasProfileResume, busy } = props;
  const set = (patch: Partial<IntakeValues>) => props.onChange({ ...values, ...patch });
  const hasResume = hasProfileResume || values.pastedResume.trim().length >= 80;

  return (
    <div className="space-y-5">
      {hasProfileResume ? (
        <div className="flex items-center gap-3 rounded-xl border border-glow/20 bg-glow/[0.04] px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/80">Resume loaded</p>
            <p className="mt-0.5 text-xs text-white/50">{props.resumeWords.toLocaleString("en-US")} words · uploaded from your profile</p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
          <label htmlFor="rr-resume" className={`${eyebrow} mb-2 block`}>Your resume text</label>
          <textarea
            id="rr-resume"
            className={`${inputCls} h-44 resize-y`}
            placeholder="Paste your resume here, or upload a PDF under Settings and it loads automatically."
            value={values.pastedResume}
            onChange={(e) => set({ pastedResume: e.target.value })}
          />
          <button type="button" onClick={props.onGoToSettings} className={`${quietBtn} mt-3`}>Upload a PDF in Settings →</button>
        </div>
      )}

      <fieldset>
        <legend className={`${eyebrow} mb-2`}>Where are you in your career?</legend>
        <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={values.stage === s}
              onClick={() => set({ stage: s })}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition cursor-pointer ${
                values.stage === s
                  ? "border-white/30 bg-white/[0.09] text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="rr-title" className={`${eyebrow} mb-2 block`}>Job title you are going for</label>
        <input
          id="rr-title"
          className={inputCls}
          placeholder="e.g. Business Analyst, Software Engineer Intern"
          maxLength={100}
          value={values.targetTitle}
          onChange={(e) => set({ targetTitle: e.target.value })}
        />
      </div>

      <div>
        <label htmlFor="rr-posting" className={`${eyebrow} mb-2 block`}>A real job posting <span className="font-normal text-white/30">(optional, but it sharpens the review)</span></label>
        <textarea
          id="rr-posting"
          className={`${inputCls} h-40 resize-y`}
          placeholder="Paste the responsibilities and requirements..."
          value={values.jobPosting}
          onChange={(e) => set({ jobPosting: e.target.value })}
        />
      </div>

      <button type="button" onClick={props.onSubmit} disabled={busy || !hasResume} className={primaryBtn}>
        {busy ? (
          <span className="flex items-center justify-center gap-2"><Spinner />Reading your resume…</span>
        ) : (
          "Ask me the right questions"
        )}
      </button>
      <p className="text-center text-xs text-white/40">
        Two steps: a few questions first, then your review. Each step uses one of your free AI requests for today (no limit with your own API key).
      </p>
    </div>
  );
}

/* ── Step 1: the questions ───────────────────────────────────────── */

export function QuestionsForm(props: {
  questions: ReviewQuestion[];
  answers: string[];
  busy: boolean;
  onAnswer: (index: number, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const answered = props.answers.filter((a) => a.trim()).length;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">A few questions first</h2>
        <p className="mt-1 text-sm text-white/60">
          The best resume lines come from your answers, not guesses. Answer what you can in a sentence or two. Skip any you can’t, and the review will leave a blank [X] for you to fill.
        </p>
      </div>
      <ol className="space-y-4">
        {props.questions.map((q, i) => (
          <li key={i} className={`${card} p-4`}>
            {q.about ? <p className={`${eyebrow} mb-1`}>{q.about}</p> : null}
            <label htmlFor={`rr-q-${i}`} className="block text-sm font-medium leading-relaxed text-white/90">
              <span className="mr-2 tabular-nums text-white/40">{i + 1}.</span>{q.q}
            </label>
            <textarea
              id={`rr-q-${i}`}
              className={`${inputCls} mt-3 h-20 resize-y`}
              placeholder="Your answer (optional)"
              maxLength={800}
              value={props.answers[i] ?? ""}
              onChange={(e) => props.onAnswer(i, e.target.value)}
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={props.onSubmit} disabled={props.busy} className={primaryBtn}>
        {props.busy ? (
          <span className="flex items-center justify-center gap-2"><Spinner />Scoring your resume…</span>
        ) : (
          `Get my review${answered ? ` (${answered} answered)` : ""}`
        )}
      </button>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={props.onBack} disabled={props.busy} className={quietBtn}>← Change my details</button>
        <p className="text-xs text-white/40">Uses one more free AI request.</p>
      </div>
    </div>
  );
}

/* ── Step 2: the review ──────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <h3 className={`${eyebrow} mb-3`}>{title}</h3>
      {children}
    </section>
  );
}

function NumberedList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-white/40">{empty ?? "Nothing to add."}</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-white/70">
          <span className="mt-0.5 w-4 flex-none tabular-nums text-white/40">{i + 1}</span>
          <span className="min-w-0 break-words">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "good" | "gap" }) {
  if (items.length === 0) return <p className="text-sm text-white/40">None found.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((k, i) => (
        <li
          key={i}
          className={`rounded-md px-2 py-1 text-xs ${tone === "good" ? "bg-emerald-500/[0.10] text-emerald-300" : "bg-white/[0.05] text-white/70"}`}
        >
          {k}
        </li>
      ))}
    </ul>
  );
}

export function ReviewReport({ review, onRestart }: { review: ReviewResult; onRestart: () => void }) {
  const ratio = review.score / 100;
  return (
    <div className="space-y-4">
      {/* Score */}
      <div className={`${card} p-6`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-6xl font-semibold tabular-nums tracking-tight ${ratioText(ratio)}`} aria-label={`Score ${review.score} out of 100`}>{review.score}</span>
            <span className="text-lg text-white/40">/ 100</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-white">{review.band}</p>
            <p className="mt-1 break-words text-sm text-white/60">
              {[STAGE_LABELS[review.stage], review.target_title || null].filter(Boolean).join(" · ")}
            </p>
            {review.segment ? (
              <p className="mt-2 text-xs text-white/50">Reads as: <span className="text-white/80">{review.segment.name}</span></p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
          <div className={`h-full rounded-full ${ratioColor(ratio)}`} style={{ width: `${review.score}%` }} />
        </div>
      </div>

      {review.numbers_replaced > 0 ? (
        <div role="note" className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.05] px-4 py-3 text-sm text-yellow-200/90">
          The AI put {review.numbers_replaced === 1 ? "1 number" : `${review.numbers_replaced} numbers`} in the rewrites that you never gave it, so we swapped {review.numbers_replaced === 1 ? "it" : "them"} for [X]. Only use figures you can back up.
        </div>
      ) : null}

      {/* Strengths and fixes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="Top strengths"><NumberedList items={review.strengths} /></Section>
        <Section title="Fix these first"><NumberedList items={review.fixes} /></Section>
      </div>

      {/* Rubric */}
      <Section title="Score breakdown">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Score by dimension</caption>
          <thead className="sr-only"><tr><th>Dimension</th><th>Score</th><th>Note</th></tr></thead>
          <tbody className="block space-y-5 md:table-row-group md:space-y-0">
            {review.rubric.map((r) => {
              const rr = r.score / r.max;
              return (
                <tr key={r.key} className="block md:table-row">
                  <th scope="row" className="block pb-1 font-medium text-white/80 md:table-cell md:w-48 md:py-3 md:pr-4 md:align-top">{r.label}</th>
                  <td className="block md:table-cell md:w-56 md:py-3 md:pr-4 md:align-top">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                        <div className={`h-full rounded-full ${ratioColor(rr)}`} style={{ width: `${rr * 100}%` }} />
                      </div>
                      <span className={`w-12 flex-none text-right text-sm font-semibold tabular-nums ${ratioText(rr)}`}>{r.score}/{r.max}</span>
                    </div>
                  </td>
                  <td className="block pt-1.5 text-xs leading-relaxed text-white/50 md:table-cell md:py-3 md:align-top md:text-sm">{r.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* Rewrites */}
      <Section title="Line-by-line rewrites">
        {review.rewrites.length === 0 ? (
          <p className="text-sm text-white/40">No lines needed rewriting.</p>
        ) : (
          <>
            <p className="mb-4 text-xs leading-relaxed text-white/50">
              Drafts, not final copy. Anything in [brackets] is a number or fact only you know. Answer the questions, fill the blanks, and make sure it is true.
            </p>
            <div className="hidden grid-cols-3 gap-4 border-b border-white/[0.06] pb-2 md:grid">
              <p className={eyebrow}>Original</p><p className={eyebrow}>Questions for you</p><p className={eyebrow}>Draft rewrite</p>
            </div>
            <ul className="divide-y divide-white/[0.06]">
              {review.rewrites.map((w, i) => (
                <li key={i} className="grid grid-cols-1 gap-3 py-4 md:grid-cols-3 md:gap-4">
                  <div className="min-w-0">
                    <p className={`${eyebrow} mb-1 md:hidden`}>Original</p>
                    <p className="break-words text-sm leading-relaxed text-white/50">{w.original}</p>
                  </div>
                  <div className="min-w-0">
                    <p className={`${eyebrow} mb-1 md:hidden`}>Questions for you</p>
                    <ul className="space-y-1.5">
                      {w.questions.map((q, j) => <li key={j} className="break-words text-sm leading-relaxed text-white/70">{q}</li>)}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <p className={`${eyebrow} mb-1 md:hidden`}>Draft rewrite</p>
                    <p className="break-words rounded-lg bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-white">{w.rewrite}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {review.missing_evidence.length > 0 ? (
        <Section title="Gather this before your next draft">
          <ul className="space-y-2">
            {review.missing_evidence.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-white/70">
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-white/40" />
                <span className="min-w-0 break-words">{m}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={review.segment ? `Fit for ${review.segment.name}` : "Fit for the role"}>
        <div className="space-y-4">
          <div><p className="mb-2 text-xs text-white/50">Keywords you already show</p><Chips items={review.keywords_present} tone="good" /></div>
          <div><p className="mb-2 text-xs text-white/50">Keywords to add, only where they are true</p><Chips items={review.keywords_missing} tone="gap" /></div>
          {review.red_flags.length > 0 ? (
            <div><p className="mb-2 text-xs text-white/50">Red flags</p><NumberedList items={review.red_flags} /></div>
          ) : null}
        </div>
      </Section>

      <Section title="Be ready to talk about">
        <ul className="space-y-4">
          {review.interview.map((it, i) => (
            <li key={i}>
              <p className="break-words text-sm font-medium leading-relaxed text-white/90">{it.bullet}</p>
              {it.story ? <p className="mt-1 break-words text-sm leading-relaxed text-white/60">Prepare: {it.story}</p> : null}
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex justify-center pt-2">
        <button type="button" onClick={onRestart} className={quietBtn}>Review another version</button>
      </div>
    </div>
  );
}
