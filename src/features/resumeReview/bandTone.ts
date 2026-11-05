import { bandFor, SCORE_BANDS } from "../../../supabase/functions/_shared/resumeReview.ts";

const BAND_TONES = ["emerald", "yellow", "orange", "red"] as const;
const TONE_CLASSES = {
  emerald: { bar: "bg-emerald-500", text: "text-emerald-400" },
  yellow: { bar: "bg-yellow-500", text: "text-yellow-400" },
  orange: { bar: "bg-orange-500", text: "text-orange-400" },
  red: { bar: "bg-red-500", text: "text-red-400" },
} as const;

/** Colour for a 0-100 score, taken from the same SCORE_BANDS that name the score. */
export function bandTone(score: number) {
  const label = bandFor(score);
  const i = Math.max(0, SCORE_BANDS.findIndex((b) => b.label === label));
  return { label, ...TONE_CLASSES[BAND_TONES[i]] };
}
