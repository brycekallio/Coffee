import { useState } from "react";
import { toast } from "sonner";
import Card from "../components/ui/Card";
import type { Profile, FieldMap } from "../types";
import { adjustResume } from "../lib/resumeUtils";
import AiEngineSettings from "../features/ai/AiEngineSettings";
import { type AiStatus, PowerTierRequiredError } from "../features/ai/client";

interface SettingsPageProps {
  displayName: string;
  setDisplayName: (v: string) => void;
  myLinkedInUrl: string;
  setMyLinkedInUrl: (v: string) => void;
  userPhone: string;
  setUserPhone: (v: string) => void;
  userCareerInterests: string;
  setUserCareerInterests: (v: string) => void;
  accountEmail: string;
  accountProvider: string;
  profile: Profile | null;
  savingProfile: boolean;
  saveProfile: () => void;
  uploadResume: (file: File) => void;
  openResume: () => void;
  importFileName: string;
  importRows: Record<string, string>[];
  importMap: FieldMap;
  importing: boolean;
  onPickCsv: (file: File) => void;
  importIntoSupabase: () => void;
  inputCls: string;
  selectCls: string;
  reparseResume: () => void;
  onCalendarConnect: () => void;
  onCalendarDisconnect: () => void;
}

export default function SettingsPage({
  displayName,
  setDisplayName,
  myLinkedInUrl,
  setMyLinkedInUrl,
  userPhone,
  setUserPhone,
  userCareerInterests,
  setUserCareerInterests,
  accountEmail,
  accountProvider,
  profile,
  savingProfile,
  saveProfile,
  uploadResume,
  openResume,
  importFileName,
  importRows,
  importMap,
  importing,
  onPickCsv,
  importIntoSupabase,
  inputCls,
  selectCls,
  reparseResume,
  onCalendarConnect,
  onCalendarDisconnect,
}: SettingsPageProps) {
  const [jobDescription, setJobDescription] = useState("");
  const [adjustResult, setAdjustResult] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"suggestions" | "rewrite">("suggestions");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [resultModel, setResultModel] = useState("");

  const isPowerTier = aiStatus?.tier === "power";

  async function handleAdjust() {
    if (!profile?.resume_text?.trim()) {
      toast.error("No resume text available. Upload a PDF resume first.");
      return;
    }
    if (!jobDescription.trim()) {
      toast.error("Paste a job description first.");
      return;
    }

    setAdjusting(true);
    setAdjustResult("");
    setResultModel("");
    try {
      const result = await adjustResume(
        profile.resume_text,
        jobDescription,
        adjustMode
      );
      setAdjustResult(result.suggestions);
      setResultModel(result.model);
    } catch (e) {
      if (e instanceof PowerTierRequiredError) {
        // Fall back to the mode that works on the free engine rather than dead-ending.
        setAdjustMode("suggestions");
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Request failed.");
      }
    } finally {
      setAdjusting(false);
    }
  }

  function copyResult() {
    if (!adjustResult) return;
    navigator.clipboard.writeText(adjustResult);
    toast.success(
      adjustMode === "rewrite"
        ? "Rewritten resume copied to clipboard."
        : "Suggestions copied to clipboard."
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile — 2/3 */}
        <div className="lg:col-span-2">
          <Card title="Profile" subtitle="This info will power personalization (emails, cover letters, etc.).">
            <div className="grid gap-3">
              <input className={inputCls} placeholder="Display name (username)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

              <input className={inputCls} placeholder="Your LinkedIn URL" value={myLinkedInUrl} onChange={(e) => setMyLinkedInUrl(e.target.value)} />

              <input className={inputCls} placeholder="Phone number" value={userPhone} onChange={(e) => setUserPhone(e.target.value)} />

              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                placeholder="Career interests (e.g. Product Management, UX Design...)"
                value={userCareerInterests}
                onChange={(e) => setUserCareerInterests(e.target.value)}
              />

              <div className="rounded-input bg-depth-0/30 p-4">
                <div className="text-sm font-medium text-white">Resume upload</div>
                <div className="mt-1 text-xs text-white/30">
                  Upload PDF/DOC/DOCX to Supabase Storage bucket <span className="font-medium text-glow/70">resumes</span>.
                </div>

                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf"
                    className="block w-full text-sm text-white/50 file:mr-4 file:cursor-pointer file:rounded-button file:border-0 file:bg-glow/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-glow hover:file:bg-glow/15"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadResume(f);
                    }}
                  />
                  {profile?.resume_url ? (
                    <button
                      onClick={openResume}
                      className="rounded-button bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
                    >
                      View resume
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-end">
                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? "Saving..." : "Save profile"}
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Account — 1/3 */}
        <div className="lg:col-span-1">
          <Card title="Account" subtitle="Managed by your sign-in provider.">
            <div className="grid gap-3">
              <div className="rounded-input border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-white/25">Signed in with</div>
                <div className="mt-0.5 text-sm capitalize text-white/70">{accountProvider}</div>
              </div>
              <div className="rounded-input border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-white/25">Email</div>
                <div className="mt-0.5 truncate text-sm text-white/70">{accountEmail}</div>
              </div>
              {/* Nothing to edit here on purpose: the address comes from the provider
                  on every sign-in, and Coffee never holds a password to change. */}
              <p className="text-xs leading-relaxed text-white/25">
                Change your email with your provider and it updates here next time you sign in.
                Coffee never stores a password.
              </p>
            </div>
          </Card>
        </div>

        {/* Integrations — full width */}
        <div className="lg:col-span-3">
          <Card
            title="Integrations"
            subtitle="Connect external services to power features like automatic calendar scheduling."
          >
            <div className="flex items-center justify-between rounded-input bg-depth-0/30 p-4">
              <div className="flex items-center gap-3">
                {/* Google Calendar icon */}
                <div className="flex h-9 w-9 items-center justify-center rounded-button bg-white/[0.06]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5" className="text-white/40" />
                    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" className="text-white/40" />
                    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-white/40" />
                    <rect x="7" y="13" width="4" height="3" rx="0.5" fill="currentColor" className="text-glow/70" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Google Calendar</div>
                  <div className="mt-0.5 text-xs text-white/40">
                    {profile?.google_calendar_token
                      ? "Connected — outreach events are added to your primary calendar automatically."
                      : "Connect to automatically add scheduled outreach to your Google Calendar."}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-4">
                {profile?.google_calendar_token ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-green-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                      Connected
                    </span>
                    <button
                      onClick={onCalendarDisconnect}
                      className="rounded-button bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/70 cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onCalendarConnect}
                    className="rounded-button bg-glow/90 px-4 py-2 text-sm font-semibold text-depth-0 shadow-[0_0_20px_rgba(0,229,255,0.18)] transition-all hover:bg-glow cursor-pointer"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {!profile?.google_calendar_token && (
              <p className="mt-3 text-xs text-white/25">
                You'll be redirected to Google to authorise access. Only calendar event creation is requested — Coffee? cannot read your existing events.
              </p>
            )}
          </Card>
        </div>

        {/* AI engine — full width. Sits above the AI tools it powers. */}
        <div className="lg:col-span-3">
          <AiEngineSettings
            inputCls={inputCls}
            selectCls={selectCls}
            onTierChange={setAiStatus}
          />
        </div>

        {/* Resume Adjuster — full width */}
        <div className="lg:col-span-3">
          <Card
            title="Resume Adjuster"
            subtitle="Paste a job description and get AI-powered keyword suggestions to tailor your resume."
            right={
              <div className="flex items-center gap-3">
                {/* Reports the engine actually in use — see the AI engine card above. */}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isPowerTier ? "bg-glow" : "bg-glow/40"
                    }`}
                  />
                  <span className="text-xs text-white/40">
                    {isPowerTier ? "Your key" : "Free engine"}
                  </span>
                </div>

                {/* Re-parse button */}
                {profile?.resume_url && (
                  <button
                    onClick={reparseResume}
                    disabled={savingProfile}
                    className="rounded-button bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-50 cursor-pointer"
                  >
                    Re-parse Resume
                  </button>
                )}
              </div>
            }
          >
            <div className="grid gap-4">
              {/* Resume text display */}
              {profile?.resume_text ? (
                <div className="rounded-input bg-depth-0/30 p-4">
                  <div className="mb-2 text-xs font-medium text-white/40">Parsed resume text</div>
                  <div className="max-h-48 overflow-y-auto text-sm text-white/60 whitespace-pre-wrap">
                    {profile.resume_text}
                  </div>
                </div>
              ) : (
                <div className="rounded-input bg-depth-0/30 p-4 text-center">
                  <p className="text-sm text-white/40">
                    {profile?.resume_url
                      ? "Resume uploaded but text not yet extracted. Click \"Re-parse Resume\" above."
                      : "No resume uploaded yet. Upload a PDF in the Profile section above."}
                  </p>
                </div>
              )}

              {/* Output mode — a full rewrite is a power-tier tool. */}
              <div>
                <label className="mb-1 block text-xs font-medium text-white/40">
                  What should the AI produce?
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => setAdjustMode("suggestions")}
                    className={`flex-1 rounded-input px-4 py-3 text-left transition-colors cursor-pointer ${
                      adjustMode === "suggestions"
                        ? "bg-glow/[0.08] text-white"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
                    }`}
                  >
                    <div className="text-sm font-medium">Keyword suggestions</div>
                    <div className="mt-0.5 text-xs text-white/30">
                      5–10 targeted phrase swaps. Works on the free engine.
                    </div>
                  </button>
                  <button
                    onClick={() => setAdjustMode("rewrite")}
                    className={`flex-1 rounded-input px-4 py-3 text-left transition-colors cursor-pointer ${
                      adjustMode === "rewrite"
                        ? "bg-glow/[0.08] text-white"
                        : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      Full rewrite
                      {!isPowerTier && (
                        <span className="rounded-badge bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-white/40">
                          Your key
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-white/30">
                      The whole resume, retargeted at this one posting.
                    </div>
                  </button>
                </div>
              </div>

              {/* Job description textarea */}
              <textarea
                className={`${inputCls} min-h-[120px] resize-y`}
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdjust}
                  disabled={adjusting || !profile?.resume_text}
                  className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow disabled:opacity-50 cursor-pointer"
                >
                  {adjusting
                    ? adjustMode === "rewrite"
                      ? "Rewriting..."
                      : "Adjusting..."
                    : adjustMode === "rewrite"
                    ? "Rewrite Resume"
                    : "Adjust Resume"}
                </button>

                {adjustResult && (
                  <button
                    onClick={copyResult}
                    className="rounded-button bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
                  >
                    {adjustMode === "rewrite" ? "Copy Resume" : "Copy Suggestions"}
                  </button>
                )}
              </div>

              {/* AI output area */}
              {adjustResult && (
                <div className="rounded-input bg-depth-0/30 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-white/40">
                      {adjustMode === "rewrite" ? "Rewritten Resume" : "AI Suggestions"}
                    </span>
                    {resultModel && (
                      <span className="font-data text-[10px] text-white/25">
                        {resultModel}
                      </span>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto text-sm text-white/70 whitespace-pre-wrap">
                    {adjustResult}
                  </div>
                </div>
              )}

            </div>
          </Card>
        </div>

        {/* Import — full width */}
        <div className="lg:col-span-3">
          <Card title="Import Network (CSV)" subtitle="Smart Import detects columns automatically (email, phone, name, company, job title).">
            <div className="grid gap-4">
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-white/50 file:mr-4 file:cursor-pointer file:rounded-button file:border-0 file:bg-glow/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-glow hover:file:bg-glow/15"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  onPickCsv(f);
                }}
              />

              {importFileName ? (
                <div className="rounded-input bg-depth-0/30 p-4">
                  <div className="text-sm font-medium text-white">Loaded: {importFileName}</div>
                  <div className="mt-1 font-data text-xs text-white/30">
                    Detected mapping:{" "}
                    {Object.entries(importMap)
                      .filter(([, v]) => !!v)
                      .map(([k, v]) => `${k} \u2190 ${v}`)
                      .join(" \u2022 ") || "none"}
                  </div>

                  <div className="mt-4 rounded-section bg-depth-0/40">
                    <div className="px-4 py-2 text-xs text-white/30">Preview: {importRows.length} row(s)</div>

                    <div className="grid grid-cols-5 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-white/25 font-medium">
                      <div>Name</div>
                      <div>Company</div>
                      <div>Title</div>
                      <div>Email</div>
                      <div>Phone</div>
                    </div>

                    <div className="h-px w-full bg-white/[0.04]" />

                    {importRows.slice(0, 10).map((r, idx) => {
                      const map = importMap;

                      const name =
                        (map.full_name && r[map.full_name]) ||
                        [map.first_name ? r[map.first_name] : "", map.last_name ? r[map.last_name] : ""]
                          .filter(Boolean)
                          .join(" ");

                      const company = map.company ? r[map.company] : "";
                      const title = map.title ? r[map.title] : "";
                      const email = map.email ? r[map.email] : "";
                      const phone = map.phone ? r[map.phone] : "";

                      return (
                        <div key={idx} className="grid grid-cols-5 gap-2 px-4 py-2 text-sm text-white/50">
                          <div className="truncate" title={name}>
                            {name || "\u2014"}
                          </div>
                          <div className="truncate" title={company}>
                            {company || "\u2014"}
                          </div>
                          <div className="truncate" title={title}>
                            {title || "\u2014"}
                          </div>
                          <div className="truncate font-data" title={email}>
                            {email || "\u2014"}
                          </div>
                          <div className="truncate font-data" title={phone}>
                            {phone || "\u2014"}
                          </div>
                          <div className="col-span-5 h-px w-full bg-white/[0.03]" />
                        </div>
                      );
                    })}

                    <div className="px-4 py-2 text-xs text-white/20">Showing first 10 rows. All rows will import.</div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      disabled={importing || importRows.length === 0}
                      onClick={importIntoSupabase}
                      className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow disabled:opacity-50 cursor-pointer"
                    >
                      {importing ? "Importing..." : "Import into Coffee?"}
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-white/25">
                    If LinkedIn doesn't import: Sheets often exports only visible hyperlink text, not the URL. Import, then add LinkedIn via Edit.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
