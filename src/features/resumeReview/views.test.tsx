import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_QUESTIONS, DEMO_REVIEW } from "@/demo/demoResumeReview";
import { RUBRIC } from "../../../supabase/functions/_shared/resumeReview.ts";
import { bandTone } from "./bandTone";
import { IntakeForm, QuestionsForm, ReviewReport } from "./views";

const noop = () => {};

describe("Resume review page, step by step", () => {
  it("intake: asks for stage, title, optional posting, and says what it costs", () => {
    const html = renderToStaticMarkup(
      <IntakeForm
        values={{ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "" }}
        hasProfileResume={true} resumeWords={312} busy={false}
        onChange={noop} onSubmit={noop} onGoToSettings={noop}
      />,
    );
    expect(html).toContain("Resume loaded");
    expect(html).toContain("312 words");
    for (const s of ["Student", "New grad", "1-3 years"]) expect(html).toContain(s);
    expect(html).toContain("Job title you are going for");
    expect(html).toContain("optional");
    expect(html).toContain("Ask me the right questions");
    expect(html).toContain("one of your free AI requests");
  });

  it("intake: without a profile resume it offers a paste box and keeps the button off", () => {
    const html = renderToStaticMarkup(
      <IntakeForm
        values={{ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "" }}
        hasProfileResume={false} resumeWords={0} busy={false}
        onChange={noop} onSubmit={noop} onGoToSettings={noop}
      />,
    );
    expect(html).toContain('id="rr-resume"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Ask me the right questions/);
  });

  it("questions: one skippable text box per question", () => {
    const html = renderToStaticMarkup(
      <QuestionsForm
        questions={DEMO_QUESTIONS} answers={DEMO_QUESTIONS.map((_, i) => (i === 0 ? "The finance faculty" : ""))}
        busy={false} onAnswer={noop} onSubmit={noop} onBack={noop}
      />,
    );
    expect(html.match(/<textarea/g)).toHaveLength(DEMO_QUESTIONS.length);
    expect(html).toContain(DEMO_QUESTIONS[0].q);
    expect(html).toContain("The finance faculty");
    expect(html).toContain("Skip any you can’t");
    expect(html).toContain("Get my review (1 answered)");
  });

  it("review: score, every rubric row, rewrites table, interview readiness", () => {
    const html = renderToStaticMarkup(<ReviewReport review={DEMO_REVIEW} onRestart={noop} />);
    expect(html).toContain(`>${DEMO_REVIEW.score}<`);
    expect(html).toContain(DEMO_REVIEW.band);
    for (const r of RUBRIC) expect(html).toContain(r.label);
    expect(html).toMatch(/Original/);
    expect(html).toMatch(/Questions for you/);
    expect(html).toMatch(/Draft rewrite/);
    for (const w of DEMO_REVIEW.rewrites) expect(html).toContain(w.rewrite.slice(0, 30));
    expect(html).toContain("Be ready to talk about");
    expect(html).toContain("Consulting and Strategy");
    expect(html).not.toContain("swapped");
  });

  it("review: says so when invented numbers were swapped for [X]", () => {
    const html = renderToStaticMarkup(<ReviewReport review={{ ...DEMO_REVIEW, numbers_replaced: 2 }} onRestart={noop} />);
    expect(html).toContain("2 numbers");
    expect(html).toContain("swapped them for [X]");
  });

  it("demo review is internally consistent: total = sum of rubric rows, rows within weights, rewrites use placeholders", () => {
    expect(DEMO_REVIEW.score).toBe(DEMO_REVIEW.rubric.reduce((n, r) => n + r.score, 0));
    for (const r of DEMO_REVIEW.rubric) expect(r.score).toBeLessThanOrEqual(r.max);
    expect(DEMO_REVIEW.rewrites.every((w) => w.rewrite.includes("[X]") || w.rewrite.includes("[N]"))).toBe(true);
    expect(DEMO_REVIEW.rewrites).toHaveLength(3);
    // CU bullet rules: 20 words or fewer, action verb first, no articles
    for (const w of DEMO_REVIEW.rewrites) {
      expect(w.rewrite.split(/\s+/).length).toBeLessThanOrEqual(20);
      expect(w.rewrite).not.toMatch(/\b(a|an|the)\b/i);
    }
  });
});

describe("score colour follows the score band", () => {
  it("82 is Targeted fixes, 62 and 58 are both Restructure, 90 is Ready, 30 is Rebuild", () => {
    expect(bandTone(82).label).toBe("Targeted fixes");
    expect(bandTone(62).bar).toBe(bandTone(58).bar);
    expect(bandTone(62).label).toBe("Restructure");
    expect(bandTone(90).label).toBe("Ready to submit");
    expect(new Set([90, 82, 62, 30].map((n) => bandTone(n).bar)).size).toBe(4);
  });
});

describe("intake: a saved resume can always be replaced", () => {
  it("offers 'Use different text' next to the loaded resume", () => {
    const html = renderToStaticMarkup(
      <IntakeForm values={{ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "" }}
        hasProfileResume={true} resumeWords={312} profileChars={2000} busy={false}
        onChange={noop} onSubmit={noop} onGoToSettings={noop} />,
    );
    expect(html).toContain("Use different text");
  });

  it("with own text on, shows the box and the character count", () => {
    const html = renderToStaticMarkup(
      <IntakeForm values={{ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "x".repeat(500), useOwnText: true }}
        hasProfileResume={true} resumeWords={312} profileChars={20000} busy={false}
        onChange={noop} onSubmit={noop} onGoToSettings={noop} />,
    );
    expect(html).toContain('id="rr-resume"');
    expect(html).toContain("500 / 9,000");
  });

  it("warns before sending when the saved resume is over the limit, and disables the button", () => {
    const html = renderToStaticMarkup(
      <IntakeForm values={{ stage: "student", targetTitle: "", jobPosting: "", pastedResume: "" }}
        hasProfileResume={true} resumeWords={3000} profileChars={20000} busy={false}
        onChange={noop} onSubmit={noop} onGoToSettings={noop} />,
    );
    expect(html).toContain("20,000");
    expect(html).toContain("9,000");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Ask me the right questions/);
  });
});
