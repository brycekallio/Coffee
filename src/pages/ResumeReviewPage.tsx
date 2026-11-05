import { useState } from "react";
import { useProfile } from "@/features/profile/profileContext";
import { fetchQuestions, fetchReview } from "@/features/resumeReview/api";
import { IntakeForm, QuestionsForm, ReviewReport, type IntakeValues } from "@/features/resumeReview/views";
import { errorMessage } from "../lib/utils";
import type { ReviewQuestion, ReviewResult } from "../../supabase/functions/_shared/resumeReview.ts";

interface Props {
  /** The "no resume" state links here. */
  onGoToSettings: () => void;
}

type Step = "intake" | "questions" | "review";

/**
 * Two AI requests: (1) probing questions about the resume, (2) the scored review using the
 * answers. The profile's resume text is used when there is one; otherwise the student pastes it.
 */
export default function ResumeReviewPage({ onGoToSettings }: Props) {
  const { profile } = useProfile();
  const profileResume = profile?.resume_text?.trim() ?? "";

  const [step, setStep] = useState<Step>("intake");
  const [values, setValues] = useState<IntakeValues>({ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "" });
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resumeText = profileResume || values.pastedResume.trim();
  const target = { resumeText, jobPosting: values.jobPosting.trim(), stage: values.stage, targetTitle: values.targetTitle.trim() };

  async function askQuestions() {
    setBusy(true);
    setError(null);
    try {
      const qs = await fetchQuestions(target);
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
      setStep("questions");
    } catch (e) {
      setError(errorMessage(e, "Couldn't read your resume just now. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function getReview() {
    setBusy(true);
    setError(null);
    try {
      const pairs = questions.map((q, i) => ({ question: q.q, answer: answers[i] ?? "" })).filter((p) => p.answer.trim());
      setReview(await fetchReview(target, pairs));
      setStep("review");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(errorMessage(e, "The review didn't work this time. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setStep("intake");
    setQuestions([]);
    setAnswers([]);
    setReview(null);
    setError(null);
  }

  return (
    <div className={`mx-auto max-w-7xl px-4 pb-10 md:px-6 ${step === "review" ? "[&>*]:max-w-4xl" : "[&>*]:max-w-3xl"}`}>
      <div>
        {step === "intake" ? (
          <IntakeForm
            values={values}
            hasProfileResume={profileResume.length > 0}
            resumeWords={profileResume ? profileResume.split(/\s+/).length : 0}
            busy={busy}
            onChange={setValues}
            onSubmit={askQuestions}
            onGoToSettings={onGoToSettings}
          />
        ) : null}
        {step === "questions" ? (
          <QuestionsForm
            questions={questions}
            answers={answers}
            busy={busy}
            onAnswer={(i, v) => setAnswers((prev) => prev.map((a, j) => (j === i ? v : a)))}
            onSubmit={getReview}
            onBack={() => { setError(null); setStep("intake"); }}
          />
        ) : null}
        {step === "review" && review ? <ReviewReport review={review} onRestart={restart} /> : null}

        {error ? (
          <div role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
