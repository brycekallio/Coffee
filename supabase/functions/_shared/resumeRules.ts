/**
 * Every review rule in one place: rubric weights and bands, stage lens, page length, GPA
 * rule, red flags, ATS checklist, bullet rules, segment matrices. The prompts in
 * resumeReview.ts import from here and hard-code none of it.
 *
 * Source order (Bryce, 2026-11-05): CU Boulder's resume advice (Leeds first, then CU Career
 * Services) is the source of truth. The playbook (assets/resume-advice/resume-review-playbook-2026-11.md)
 * only fills gaps: the scoring rubric and bands, intake questions, the 11 segment matrices,
 * the no-numbers fallbacks, the verb bank, the file name and the ATS layout details. The
 * playbook's market statistics are never used.
 *
 * Where each rule comes from (full table: assets/resume-advice/cu-boulder-rules.md):
 *   CU:       page length, GPA, education format, coursework, section order, per-entry format,
 *             bullet count/length/formula/verbs, pronouns and articles, tense, objective and
 *             summary, header, street address, font and margins, skills, interests,
 *             leadership, awards, high school, tailoring.
 *   Playbook: rubric weights and score bands, intake/probing questions, segment matrices
 *             (A-K), stage probing questions, no-numbers fallbacks, verb bank by skill,
 *             ATS layout details (single column, no text boxes), file name, hygiene red
 *             flags CU does not mention (acronyms, overclaiming, generic AI phrasing).
 * CU wins every conflict: page length for recent grads, GPA (no 3.3/3.5 cutoffs), bullet
 * length, high school content.
 */

export const RULES = {
  source: "CU Boulder (Leeds, then Career Services); playbook only for gaps",
  pageText: "One page for students and new grads; 1.5-2 pages only for recent grads and alumni.",
  gpaText: "List a GPA only if it is 3.0 or above, with two decimals, using the higher of cumulative or business GPA. Under 3.0, leave it off and point the student to CU Career Services.",
  bulletMaxWords: 20,
} as const;

/** CU's "Machine-usable summary", the rules every review applies. CU outranks any other advice. */
export const CU_RULES = [
  `Length: ${RULES.pageText} If over one page, drop the font to 10 pt first.`,
  "Font 10-12 pt, margins 0.5-1 in, consistent formatting and punctuation, no creative or graphic layout (ATS risk). Must read fine as PDF and as plain text.",
  "Header: name, phone | CU email (first.last@colorado.edu) | custom LinkedIn URL. City and state only, never a street address.",
  `GPA: ${RULES.gpaText}`,
  'Education first for students and new grads: "University of Colorado Boulder - Leeds School of Business", Anticipated Graduation Month/Year, spelled-out degree and emphasis, minors, GPA, awards, coursework. Education moves lower as experience grows.',
  "Relevant coursework: 3-7 courses by name, never course numbers, tailored to the job.",
  "Order: Education, Honors and Awards (optional; one honor goes in Education), Experience, Relevant Projects (optional; one project goes in Education), Leadership/Activities, Skills, Interests/Additional (optional).",
  "Every entry: organization, City, State, title, Month/Year - Month/Year or Present. Reverse chronological everywhere.",
  "2-5 bullets per entry, best first. Formula: action verb + task + result/outcome. Detailed, not fragments.",
  'Every bullet starts with an action verb. Avoid "responsible for", "helped with", and overused "led"/"managed".',
  `No I/me/my/they/our. Drop articles (a, an, the). Keep each bullet ${RULES.bulletMaxWords} words or fewer.`,
  "Quantify with numbers, percentages, scale and a time frame; numbers under 10 count. Never invent numbers. Say what YOU did, not the group.",
  "Tense: past for finished roles, present for current roles; all-past is acceptable; do not mix within an entry.",
  "No objective statement. Summary is optional: 1-3 titles, level, areas of experience, transferable skills, tailored to the posting (new grads and alumni; not needed for students).",
  "Tailor keywords to each posting; be honest; proofread (typos are a fast reject).",
  "Skills: tangible and taught (software, languages, certifications), no personal-strength adjectives; classify language level (Basic, Conversational, Proficient, Fluent).",
  "Interests: optional, 3-4 specific conversation starters.",
  "Leadership is not the same as work; quantify what you personally did (money raised, people recruited).",
  "Awards: qualify with context; Dean's List for all eligible semesters.",
  "AI use in projects: say how you used and prompted it, only if true.",
  "High school: allowed only under Additional Information, for first-years; drop by junior year. Do not flag it as a red flag.",
  "File name: CU gives no rule; suggest First-Last-Resume.pdf.",
  "Use the playbook only for method: intake questions, rubric, bullet audit, no-number fallbacks. Never quote market statistics.",
].map((l) => `- ${l}`).join("\n");

/* ── Rubric (playbook 1.4) ─────────────────────────────────────────────────── */

export const RUBRIC = [
  { key: "target_alignment", label: "Target alignment", max: 20, excellent: "Top third of the page clearly shows the target role. Keywords and skills match the posting naturally." },
  { key: "evidence_of_impact", label: "Evidence of impact", max: 25, excellent: "60%+ of bullets have a result: a number, scale, before/after, or outcome." },
  { key: "skill_proof", label: "Skill proof", max: 15, excellent: "Teamwork, problem-solving, communication and analytical skills are shown through actions, not listed as adjectives." },
  { key: "ai_digital_fluency", label: "AI and digital fluency", max: 10, excellent: "Specific tools and uses, including how the candidate validated or improved AI output." },
  { key: "experience_relevance", label: "Experience relevance", max: 15, excellent: "Internships, projects and jobs come first in order of relevance. Ownership is clear." },
  { key: "clarity", label: "Clarity", max: 10, excellent: `Meets the CU page length. Bullets are detailed, ${RULES.bulletMaxWords} words or fewer, and start with action verbs. No filler.` },
  { key: "ats_hygiene", label: "ATS hygiene", max: 5, excellent: "Single column, standard headings, consistent dates, no graphics or tables for core content." },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];

export const SCORE_BANDS = [
  { min: 85, label: "Ready to submit" },
  { min: 70, label: "Targeted fixes" },
  { min: 55, label: "Restructure" },
  { min: 0, label: "Rebuild from intake answers" },
] as const;

export function bandFor(score: number): string {
  return (SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1]).label;
}

/* ── Stages and segments (playbook 1.5, 1.7) ───────────────────────────────── */

export const STAGES = ["student", "new_grad", "early_career"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  student: "Student",
  new_grad: "New grad",
  early_career: "1-3 years",
};

export const STAGE_LENS: Record<Stage, string> = {
  student:
    "Current student. Education first, in the Leeds format. Experience can be internships, jobs, class projects and volunteer roles; treat projects like jobs (title, tools, scope, result). No summary needed. Leadership belongs in its own section, quantified. High school items only under Additional Information and only for first-years. Probe: what did this club accomplish because of you; how many people, how much money, what deadline.",
  new_grad:
    "New graduate (0-12 months out). Education stays first. An optional 1-3 line summary tailored to the posting: titles, level, areas of experience, transferable skills. Show internship conversion (return offers, extended internships, promotions). Explain gaps briefly; include certifications, freelance work and projects since graduating. Probe: what have you done since graduation that shows growth; which bullet would you defend for five minutes in an interview.",
  early_career:
    "Recent grad or early career (1-3 years). Experience first and Education moves lower as experience grows; a page and a half to two pages is acceptable, one is fine. Show progression: scope growth, promotions, bigger clients, budget, team responsibility. Use business metrics: revenue, cost, cycle time, error rates, NPS, adoption, SLA. When pivoting, reframe bullets as problem, analysis, recommendation, impact. Probe: what decision did someone make because of your work; what would your manager say you are known for.",
};

interface Segment {
  code: string;
  name: string;
  titles: string;
  musts: string;
  keywords: string;
  redFlags: string;
  asks: string;
}

export const SEGMENTS: readonly Segment[] = [
  {
    code: "A", name: "Consulting and Strategy",
    titles: "Business Analyst, Associate Consultant, Consulting Analyst, Strategy Analyst, Technology Consultant, Economic Analyst, Corporate Strategy Associate",
    musts: `academic excellence (GPA listed only per the CU rule; some consulting employers expect higher), structured problem-solving, quantitative evidence, leadership with outcomes, client-facing or stakeholder communication, case competitions or consulting clubs`,
    keywords: "market analysis, financial modeling, stakeholder interviews, recommendations, synthesized, benchmarking, due diligence, process improvement, Excel/PowerPoint, AI-assisted research",
    redFlags: "vague team bullets, no numbers, a resume over the CU page limit, typos, interests section with nothing memorable. Format: dense and conservative; a short Additional line (languages, interests, certifications)",
    asks: "Which bullet shows you structuring an ambiguous problem? Where did you change someone's mind with data? What is an interest an interviewer would ask you about?",
  },
  {
    code: "B", name: "Finance (IB, FP&A, asset management, banking)",
    titles: "IB Analyst, Financial Analyst, FP&A Analyst, Credit Analyst, Investment Analyst, Treasury Analyst",
    musts: "modeling (DCF, 3-statement, LBO), accounting fundamentals, deal or pitch exposure, student investment fund, certifications (BIWS/WSP, CFA Level I progress), Excel speed",
    keywords: "valuation, variance analysis, forecasting, budget, comps, pitch book, due diligence, Power BI, Python for finance",
    redFlags: "passion for markets with no evidence, inflated deal claims",
    asks: "Walk me through a model you built: inputs, and what decision did it support? Any automation of a recurring report?",
  },
  {
    code: "C", name: "Software Engineering",
    titles: "Software Engineer I, New Grad SWE, Backend/Frontend/Full-Stack Engineer, SDE Intern",
    musts: "shipped projects with users or metrics, internship production work, languages and frameworks tied to specific projects, testing/CI, system design exposure, AI coding tools with evidence of review discipline, portfolio or GitHub link",
    keywords: "whatever the posting lists (e.g. TypeScript, Python, Go, AWS, PostgreSQL, REST/GraphQL, LLM APIs)",
    redFlags: "skills list of 25 technologies with no proof, tutorial-clone projects, no links, no metrics (latency, users, uptime, test coverage)",
    asks: "What broke in production and how did you fix it? What part of this project would AI tools not have done for you?",
  },
  {
    code: "D", name: "Data and AI",
    titles: "Data Analyst, Business Intelligence Analyst, Data Scientist, ML Engineer, AI Engineer, Analytics Engineer",
    musts: "SQL, Python, BI tools, statistics/experimentation, end-to-end projects (question, data, model, decision), LLM application work (evaluation, prompt design, retrieval), data quality awareness",
    keywords: "A/B testing, regression, dashboards, dbt, Snowflake, feature engineering, model evaluation, LLM evaluation, stakeholder insights",
    redFlags: "Kaggle-only projects with no business framing, accuracy metrics without a baseline",
    asks: "Who used your analysis and what did they decide? How did you know your model or AI output was right?",
  },
  {
    code: "E", name: "Product and Program Management",
    titles: "Associate Product Manager, Product Analyst, Program Coordinator, Technical Program Manager (early)",
    musts: "user research, prioritization, cross-functional delivery, metrics ownership, shipped features, founder or side-project experience",
    keywords: "roadmap, user interviews, PRD, KPIs, adoption, retention, experimentation, Jira/Figma",
    redFlags: "managed without a team or outcome, no user or metric language",
    asks: "What did you decide NOT to build and why? Which metric moved?",
  },
  {
    code: "F", name: "Marketing, Growth and Communications",
    titles: "Marketing Coordinator, Growth Analyst, Content Strategist, Social Media Specialist, Brand Associate, PR Associate",
    musts: "campaign results (CTR, CAC, conversion, reach), content portfolio, analytics tools, AI content workflows with brand and quality control",
    keywords: "GA4, HubSpot, SEO, paid social, lifecycle/email, segmentation, content calendar, generative AI tools",
    redFlags: "follower counts without context, no portfolio link, creative designs that break ATS parsing",
    asks: "What was the budget and what was the return? How did you keep AI-generated content on-brand and accurate?",
  },
  {
    code: "G", name: "Operations and Supply Chain",
    titles: "Operations Analyst, Supply Chain Analyst, Procurement Analyst, Business Operations Associate, Logistics Coordinator",
    musts: "process improvement, inventory/forecast work, Lean/Six Sigma exposure, ERP systems, cost/time savings",
    keywords: "throughput, lead time, root cause, SOP, SAP/Oracle, vendor management, KPI dashboard",
    redFlags: "process work with no before/after",
    asks: "What was the before/after of the process you improved?",
  },
  {
    code: "H", name: "Engineering (non-software)",
    titles: "Engineer I/EIT, Project Engineer, Field Engineer, Manufacturing Engineer, Design Engineer",
    musts: "FE/EIT status, senior design/capstone with specs and results, co-ops, CAD/simulation tools, safety and compliance, field experience",
    keywords: "AutoCAD, SolidWorks, Revit, MATLAB, FEA, GD&T, PLC, OSHA, project scheduling",
    redFlags: "capstone with no specs or results, tools listed but never used in a bullet",
    asks: "What constraint or tradeoff drove your design decision?",
  },
  {
    code: "I", name: "Healthcare, Life Sciences and Public Health",
    titles: "Clinical Research Coordinator, Healthcare Analyst, Research Associate, Health Policy Analyst, Medical Affairs Associate",
    musts: "lab or clinical research, publications/posters, regulatory awareness (HIPAA, GCP, IRB), data skills, patient-facing experience",
    keywords: "IRB, GCP, HIPAA, protocol, data collection, REDCap, patient outcomes",
    redFlags: "research with no stated role or output",
    asks: "What was your specific role on the study? Any outputs with your name on them?",
  },
  {
    code: "J", name: "Public Sector, Policy and Nonprofit",
    titles: "Policy Analyst, Program Associate, Legislative Aide, Research Assistant, Government Consulting Analyst",
    musts: "research and writing samples, program results, grant work, stakeholder coordination, clearance eligibility (federal consulting)",
    keywords: "policy analysis, grant writing, program evaluation, stakeholder engagement, briefing memo",
    redFlags: "program work with no result, no writing sample",
    asks: "What policy or program changed because of your research?",
  },
  {
    code: "K", name: "Sales, Customer Success and Business Development",
    titles: "SDR/BDR, Account Executive (early), Customer Success Associate, Sales Analyst",
    musts: "quota attainment, pipeline generated, retention/expansion numbers, CRM use, any commission or target-based job",
    keywords: "Salesforce, pipeline, quota, prospecting, renewals, upsell, discovery calls",
    redFlags: "sales claims with no quota or ranking",
    asks: "What percent of target did you hit, and how did you rank on the team?",
  },
];

/** The segment code for a model's value: exactly one letter A-K (a separator after it is fine), or a segment name. */
export function segmentCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  const letter = v.match(/^([A-Ka-k])(?:[\s.:)\-–—]|$)/);
  if (letter) return letter[1].toUpperCase();
  const lower = v.toLowerCase();
  if (!lower) return null;
  return SEGMENTS.find((s) => s.name.toLowerCase() === lower)?.code ?? SEGMENTS.find((s) => s.name.toLowerCase().startsWith(lower) && lower.length >= 4)?.code ?? null;
}

export function segmentName(code: unknown): string | null {
  const c = segmentCode(code);
  return SEGMENTS.find((s) => s.code === c)?.name ?? null;
}

/* ── Shared prompt pieces (playbook 1.2, 1.3, 1.6, 1.8, 1.9) ───────────────── */

export const REVIEWER_QUESTIONS =
  "For each line ask: So what? How do you know (evidence, numbers, results)? Compared to what (baseline, scale)? What did YOU do versus the team? Does it transfer to the target role?";

export const HIDDEN_EVIDENCE = [
  "the hardest problem solved in the last two years and what it changed",
  "anything they saved (time or money), grew or fixed, and by how much",
  "anything led or organized, even informally",
  "tools used weekly (Excel, SQL, Python, Tableau, Figma, CAD, AI assistants)",
  "how they use AI in work or school, with a concrete example where they checked or corrected the AI's output",
  "projects, competitions, case competitions, research, publications, portfolio or GitHub",
  "part-time jobs left off because they seem irrelevant (service jobs show customer volume and reliability)",
].join("; ");

export const RED_FLAGS =
  `1 objective statement; 2 responsibilities instead of results ("responsible for", "helped with"); 3 skills as adjectives (hard-working, detail-oriented); 4 over the CU page length (${RULES.pageText}); 5 inconsistent formatting, punctuation, or tense within an entry; 6 first-person pronouns or articles in bullets; 7 bullets over ${RULES.bulletMaxWords} words, or short phrase fragments instead of detailed bullets; 8 GPA listed under 3.0, shown with one decimal, or the lower of two GPAs; 9 a street address; 10 course numbers instead of course names; 11 a skills section that lists tools no bullet uses; 12 overclaiming (led a 40-person team as an intern); 13 generic AI-sounding phrasing (spearheaded synergies, leveraged cutting-edge); 14 unexplained acronyms; 15 no sign of AI fluency in a segment that now expects it. High school content is NOT a red flag when it is under Additional Information.`;

export const ATS_CHECKLIST =
  "plain and readable as PDF and as plain text, no creative or graphic layout (CU); single column, no text boxes or icons carrying key information; standard headings (Education, Experience, Skills, Projects, Leadership); the posting's job title appears naturally; posting language mirrored only where truthful, no keyword stuffing; consistent dates (Month/Year - Month/Year or Present); header has phone, CU email, LinkedIn, city and state only. You only see plain text, so judge what the text shows and do not guess about visual layout";

export const BULLET_FORMULA =
  `CU formula: action verb + task + accomplishment or value added + result/outcome ("utilized X to do Y resulting in Z"). Detailed full bullets, ${RULES.bulletMaxWords} words or fewer, no pronouns or articles, never a short fragment; say what YOU did. Playbook method: accomplished [X] as measured by [Y] by doing [Z]. With no numbers, use scale (people, records, stakeholders), frequency, speed (from X to Y), quality, or recognition. Verbs (avoid overused led/managed): problem-solving (diagnosed, modeled, identified, prioritized, redesigned); teamwork (coordinated, partnered, aligned, facilitated); communication (presented, wrote, synthesized, briefed, persuaded); leadership (launched, recruited, mentored, scaled); analytical (quantified, forecasted, segmented, benchmarked, tested)`;
