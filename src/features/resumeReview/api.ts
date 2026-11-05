import { invokeAi } from "@/features/ai/client";
import type { QaPair, ReviewQuestion, ReviewResult, Stage } from "../../../supabase/functions/_shared/resumeReview.ts";

export interface ReviewTarget {
  resumeText: string;
  jobPosting: string;
  stage: Stage;
  targetTitle: string;
}

const base = (t: ReviewTarget) => ({
  resume_text: t.resumeText,
  job_posting: t.jobPosting,
  stage: t.stage,
  target_title: t.targetTitle,
});

/** Step 1: one AI request. */
export async function fetchQuestions(t: ReviewTarget): Promise<ReviewQuestion[]> {
  const data = await invokeAi<{ questions: ReviewQuestion[] }>("review-resume", { ...base(t), mode: "questions" });
  return data.questions;
}

/** Step 2: one AI request. Unanswered questions are left out. */
export async function fetchReview(t: ReviewTarget, answers: QaPair[]): Promise<ReviewResult> {
  const data = await invokeAi<{ review: ReviewResult }>("review-resume", { ...base(t), mode: "review", answers });
  return data.review;
}
