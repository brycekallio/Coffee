// Canned Resume review for /demo: the fictional sample student (Maya Okafor) and the same
// shapes the review-resume Edge Function returns. Anything a real student would have to
// supply is a [X] placeholder. The score is computed from the rubric rows, like the server.
import { bandFor, RUBRIC, type ReviewQuestion, type ReviewResult } from "../../supabase/functions/_shared/resumeReview.ts";

export const DEMO_QUESTIONS: ReviewQuestion[] = [
  { about: "SEC filings pipeline", q: "Who used the cleaned SEC filings data, and what did they do with it?" },
  { about: "SEC filings pipeline", q: "How long did the cleaning take before your pipeline, and how long after?" },
  { about: "Foundation dashboards", q: "How many board members or staff looked at your Tableau dashboards, and how often?" },
  { about: "Foundation internship", q: "Did a dashboard change a decision, a grant, or a report? What changed?" },
  { about: "Skills", q: "Where did you use DCF or LBO modeling: a class, a competition, or real work?" },
  { about: "AI use", q: "How do you use AI tools in your work, and what did you check or correct in what they gave you?" },
  { about: "Leadership", q: "Have you led or organized anything, even informally (a club, a study group, a project team)?" },
];

const scores: Record<string, [number, string]> = {
  target_alignment: [16, "The top of the page says finance and data science, which fits an analytics role. Add the target title near the top."],
  evidence_of_impact: [15, "Two strong projects, but only the first has a number. Most bullets say what you built, not what changed."],
  skill_proof: [11, "Problem-solving shows through the pipeline. Teamwork and communication are not shown anywhere yet."],
  ai_digital_fluency: [5, "Tools are named (Python, SQL, Tableau), but nothing says how you use AI or check its output."],
  experience_relevance: [12, "Research and the internship are in the right order. Ownership is clear on the pipeline, vaguer on the dashboards."],
  clarity: [8, "Short and readable. A few bullets start with nouns instead of verbs."],
  ats_hygiene: [5, "Plain headings and consistent dates. Nothing here would trip a screener."],
};

const rubric = RUBRIC.map((r) => ({ key: r.key, label: r.label, max: r.max, score: scores[r.key][0], note: scores[r.key][1] }));
const score = rubric.reduce((n, r) => n + r.score, 0);

export const DEMO_REVIEW: ReviewResult = {
  score,
  band: bandFor(score),
  stage: "student",
  target_title: "Data & Analytics Consultant",
  segment: { code: "A", name: "Consulting and Strategy" },
  strengths: [
    "A real data project with scale: a Python pipeline over 40k SEC filings.",
    "The skills line is specific and every tool on it is tied to your work.",
    "Finance plus Data Science is the mix analytics consulting practices look for.",
  ],
  fixes: [
    "Put a result on the pipeline bullet: who used the data and what time it saved.",
    "Show what the Tableau dashboards changed for the Foundation's board.",
    "Add one line showing how you use AI and how you check what it gives you.",
  ],
  rubric,
  rewrites: [
    {
      original: "built a Python pipeline cleaning 40k SEC filings",
      questions: ["Who used the cleaned data?", "How long did cleaning take before and after?"],
      rewrite: "Built a Python pipeline that cleans 40k SEC filings, cutting prep time from [X] to [Y] and feeding [N] faculty research projects.",
      replaced: 0,
    },
    {
      original: "grant reporting dashboards in Tableau",
      questions: ["How many people used them, and how often?", "What decision did a dashboard support?"],
      rewrite: "Designed Tableau dashboards for grant reporting, used by [N] board members each [month/quarter] to decide [X].",
      replaced: 0,
    },
    {
      original: "Excel modeling (DCF, LBO)",
      questions: ["Where did you build these models, and what did each one decide?"],
      rewrite: "Built DCF and LBO models in Excel for [class / competition / project], valuing [company] at [X] and presenting the result to [audience].",
      replaced: 0,
    },
  ],
  missing_evidence: [
    "A number for each project: people reached, records handled, hours saved.",
    "One example of working with a team, and what you did versus what they did.",
    "How you use AI tools and what you check before trusting them.",
    "Any club, case competition or leadership role, even informal.",
  ],
  keywords_present: ["Python", "SQL", "Tableau", "Excel modeling"],
  keywords_missing: ["stakeholder reporting", "client-facing", "recommendations", "data visualization"],
  red_flags: [
    "Skills are tools only. Nothing shows teamwork or communication (red flag: skills without proof).",
    "No sign of AI fluency yet, and this segment now expects it.",
  ],
  interview: [
    { bullet: "Built a Python pipeline cleaning 40k SEC filings", story: "How you found the messy files, how you checked the output was right, and who used it." },
    { bullet: "Grant reporting dashboards in Tableau", story: "One dashboard, the question it answered, and a time a board member pushed back." },
    { bullet: "Excel modeling (DCF, LBO)", story: "Walk through one model: the inputs, the assumptions you are least sure of, and the result." },
  ],
  numbers_replaced: 0,
};
