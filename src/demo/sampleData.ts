// Sample data for the local preview harness only — never shipped, never sent anywhere.
// One CU Boulder finance student partway through a consulting/finance recruiting season.
// Dates are relative to "today" so stale-contact badges and due outreach stay realistic.

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const date = (daysAgo: number) => iso(daysAgo).slice(0, 10);

export const USER_ID = "7c1e2a4b-5d6f-4a8b-9c0d-1e2f3a4b5c6d";
export const USER = { email: "maya.okafor@colorado.edu", name: "Maya Okafor" };

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

type C = [first: string, last: string, company: string, title: string, email: string | null, linkedin: string | null, addedDaysAgo: number];
const people: C[] = [
  ["Priya", "Raman", "FTI Consulting", "Senior Consultant, Data & Analytics", "priya.raman@fticonsulting.example", "https://www.linkedin.com/in/demo-priya-raman", 64],
  ["Daniel", "Choi", "Deloitte", "Analyst, Strategy & Analytics", "dchoi@deloitte.example", "https://www.linkedin.com/in/demo-daniel-choi", 58],
  ["Hannah", "Weiss", "Goldman Sachs", "Analyst, Investment Banking", null, "https://www.linkedin.com/in/demo-hannah-weiss", 51],
  ["Marcus", "Bell", "Alvarez & Marsal", "Associate", "mbell@alvarezandmarsal.example", null, 47],
  ["Sofia", "Herrera", "Bain & Company", "Associate Consultant", "sofia.herrera@bain.example", "https://www.linkedin.com/in/demo-sofia-herrera", 40],
  ["Ethan", "Park", "Houlihan Lokey", "Financial Analyst", null, "https://www.linkedin.com/in/demo-ethan-park", 36],
  ["Grace", "Liu", "Leeds School of Business", "Career Coach, Finance", "grace.liu@colorado.example", null, 33],
  ["Owen", "Fitzgerald", "Guidehouse", "Consultant", "ofitzgerald@guidehouse.example", "https://www.linkedin.com/in/demo-owen-fitzgerald", 28],
  ["Amara", "Nwosu", "J.P. Morgan", "Analyst, Corporate Banking", null, "https://www.linkedin.com/in/demo-amara-nwosu", 21],
  ["Lucas", "Moreno", "Accenture", "Analyst, Data & AI", "lucas.moreno@accenture.example", null, 15],
  ["Chloe", "Bennett", "Lazard", "Analyst, Restructuring", null, "https://www.linkedin.com/in/demo-chloe-bennett", 9],
  ["Ryan", "Takahashi", "Ankura", "Senior Associate", "ryan.takahashi@ankura.example", "https://www.linkedin.com/in/demo-ryan-takahashi", 4],
];

export const contacts = people.map(([first_name, last_name, company, title, email, linkedin_url, d]) => ({
  id: id(),
  owner_id: USER_ID,
  first_name,
  last_name,
  company,
  title,
  email,
  phone: null as string | null,
  linkedin_url,
  status: "to_contact",
  created_at: iso(d),
  last_touch_at: null, next_touch_at: null, notes: null, updated_at: null,
  // Bulk select: a couple of starred people and tags so the demo shows them.
  starred: ["Raman", "Herrera"].includes(last_name),
  tags: ({ Raman: ["Consulting"], Choi: ["Consulting"], Herrera: ["Consulting", "Case prep"], Weiss: ["Banking"], Park: ["Banking"], Nwosu: ["Banking"] } as Record<string, string[]>)[last_name] ?? [],
}));

const byLast = (last: string) => contacts.find((c) => c.last_name === last)!.id;

export const contact_meetings = [
  ["Raman", 41, "Coffee chat — D&A practice", "Practice splits into disputes analytics and forensic data. Analysts get client exposure in year one. She'll intro me to the DC recruiting lead.\n\nFollow up: send resume by Friday."],
  ["Raman", 12, "Resume review", "Lead with the Python/SQL projects, cut the coursework list. Mention the AI Club data pipeline."],
  ["Choi", 37, "Intro call", "Strategy & Analytics hires heavily from Leeds. Superday is two cases + a behavioral."],
  ["Bell", 44, "Phone call", "Restructuring vs. performance improvement — he moved from PI. Recommended reading on 13-week cash flow models."],
  ["Herrera", 35, "Coffee chat", "Bain case prep: practice market sizing out loud, structure first. Offered a mock case in two weeks."],
  ["Herrera", 6, "Mock case", "Struggled on the profitability math; structure was solid. Redo with a timer."],
  ["Liu", 30, "Recruiting plan", "Target list of 25 firms, 3 chats a week. Track every touchpoint."],
  ["Fitzgerald", 19, "Coffee chat", "Guidehouse public sector work — lots of federal clients in DC."],
  ["Takahashi", 2, "Info session follow-up", "Ankura's turnaround group is hiring two summer analysts. Apply before the 15th."],
].map(([last, d, title, notes]) => ({
  id: id(),
  owner_id: USER_ID,
  contact_id: byLast(last as string),
  meeting_date: date(d as number),
  title: title as string,
  notes: notes as string,
  created_at: iso(d as number),
}));

export const applications = [
  ["FTI Consulting", "Interviewing", 18, "Raman"],
  ["Deloitte", "Offer", 25, "Choi"],
  ["Bain & Company", "Applied", 22, "Herrera"],
  ["Alvarez & Marsal", "Rejected", 39, "Bell"],
  ["Guidehouse", "Networking", 11, "Fitzgerald"],
  ["Ankura", "Applied", 1, "Takahashi"],
  ["Huron Consulting", "Saved", 8, null],
].map(([company, status, d, last]) => ({
  id: id(),
  owner_id: USER_ID,
  company: company as string,
  link: `https://careers.example.org/${String(company).toLowerCase().replace(/[^a-z]+/g, "-")}`,
  date_applied: date(d as number),
  status: status as string,
  contact_id: last ? byLast(last as string) : null,
  created_at: iso(d as number),
}));

export const scheduled_outreach = [
  ["Raman", "email", "Thank you — and my resume", "Hi Priya, thank you again for the time on Tuesday…", -1, "scheduled"],
  ["Weiss", "email", "Following up from the Leeds finance night", "Hi Hannah, we met at the Leeds finance night…", 0, "scheduled"],
  ["Nwosu", "sms", null, "Hi Amara — Maya from CU. Would you have 15 minutes next week?", 2, "scheduled"],
  ["Choi", "email", "Superday prep question", "Hi Daniel, thanks for the overview of the Superday…", 14, "sent"],
  ["Park", "email", "Coffee chat request", "Hi Ethan, I'm a junior at CU Boulder studying finance…", 20, "opened"],
].map(([last, channel, subject, message, daysAgo, status]) => ({
  id: id(),
  owner_id: USER_ID,
  contact_id: byLast(last as string),
  channel: channel as string,
  subject: subject as string | null,
  message: message as string,
  scheduled_at: iso(daysAgo as number),
  status: status as string,
  sent_at: status === "scheduled" ? null : iso(daysAgo as number),
  failure_reason: null,
  opened_at: status === "opened" ? iso((daysAgo as number) - 1) : null,
  created_at: iso((daysAgo as number) + 2),
}));

export const watchlist_targets = [
  ["Jordan Ellis", "Evercore", "Managing Director, Restructuring", "not_contacted", 3],
  ["Nadia Haddad", "McKinsey & Company", "Engagement Manager", "contacted", 1],
  ["Tom Becker", "Kroll", "Director, Valuation", "scheduled", -2],
  ["Isabel Cruz", "PwC", "Manager, Deals Analytics", "follow_up_sent", 5],
].map(([person_name, company, role, status, inDays]) => ({
  id: id(),
  owner_id: USER_ID,
  person_name: person_name as string,
  company: company as string,
  role: role as string,
  status: status as string,
  next_action_date: date(-(inDays as number)),
  notes: null,
  created_at: iso(30),
  starred: false,
  tags: [] as string[],
}));

export const profiles = [
  {
    id: USER_ID,
    full_name: USER.name,
    my_linkedin_url: "https://www.linkedin.com/in/demo-maya-okafor",
    resume_url: `${USER_ID}/resume.pdf`,
    avatar_url: null,
    resume_text:
      "MAYA OKAFOR — B.S. Business Administration (Finance), Data Science minor, University of Colorado Boulder, 2027.\n" +
      "Experience: Research Assistant, Leeds Finance Dept — built a Python pipeline cleaning 40k SEC filings. " +
      "Analyst Intern, Boulder Community Foundation — grant reporting dashboards in Tableau.\n" +
      "Skills: Python, SQL, Excel modeling (DCF, LBO), Tableau.",
    phone: "(303) 555-0142",
    career_interests: "Data & analytics consulting, restructuring",
    onboarding_completed_at: iso(70),
    google_connected: false,
  },
];

// Figures that must agree wherever the UI shows them.
console.assert(applications.length === 7, "applications");
console.assert(scheduled_outreach.filter((o) => o.status === "scheduled").length === 3, "outreach");
