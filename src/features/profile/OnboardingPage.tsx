import { useState, useRef } from "react";
import { toast } from "sonner";
import Logo from "@/components/ui/Logo";
import { useProfile } from "./profileContext";

interface OnboardingPageProps {
  /** Leaves onboarding (finished or skipped) — App navigates to the contact list. */
  onDone: () => void;
}

type Step = {
  key: "name" | "linkedin" | "resume";
  title: string;
  sub: string;
};

const STEPS: readonly Step[] = [
  { key: "name", title: "What should we call you?", sub: "This is how you'll appear across Coffee." },
  { key: "linkedin", title: "Add your LinkedIn", sub: "So we can personalize outreach to match your profile." },
  { key: "resume", title: "Upload your resume", sub: "Drop a PDF so Coffee can tailor job applications for you." },
] as const;

const primaryBtn =
  "rounded-xl bg-glow px-6 py-3 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all duration-300 hover:shadow-[0_0_36px_rgba(0,229,255,0.3)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-none cursor-pointer";

const secondaryBtn =
  "rounded-xl bg-white/[0.04] px-6 py-3 text-sm font-medium text-white/50 transition-all duration-200 hover:bg-white/[0.08] hover:text-white cursor-pointer";

const skipBtn =
  "text-xs font-medium text-white/35 transition-colors duration-200 hover:text-white/70 cursor-pointer";

/* ── Floating label input ── */
function FloatingInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div className="group relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="peer w-full rounded-xl bg-white/[0.03] px-4 pb-2.5 pt-5 text-sm text-white outline-none transition-all duration-300 border border-white/[0.06] focus:border-glow/40 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(0,229,255,0.08)]"
        placeholder={active ? placeholder : " "}
      />
      <label
        className={`pointer-events-none absolute left-4 transition-all duration-200 ${
          active
            ? "top-1.5 text-[10px] font-medium text-glow/70"
            : "top-3.5 text-sm text-white/30"
        }`}
      >
        {label}
      </label>
    </div>
  );
}

/** Rendered only once the profile has loaded, so the drafts below seed from real values. */
export default function OnboardingPage({ onDone }: OnboardingPageProps) {
  const { profile, saving: savingProfile, saveProfile: save, uploadResume, completeOnboarding } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.full_name ?? "");
  const [myLinkedInUrl, setMyLinkedInUrl] = useState(profile?.my_linkedin_url ?? "");
  const saveProfile = () =>
    save({ full_name: displayName.trim() || null, my_linkedin_url: myLinkedInUrl.trim() || null });
  const [step, setStep] = useState(0);
  const [stepping, setStepping] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  const canAdvanceName = displayName.trim().length > 0;

  const animateStep = (dir: 1 | -1, cb: () => void) => {
    if (stepping) return;
    setStepping(true);
    const el = cardRef.current;
    if (el) {
      el.style.transition = "opacity 0.2s, transform 0.2s";
      el.style.opacity = "0";
      el.style.transform = dir > 0 ? "translateX(-16px)" : "translateX(16px)";
    }
    setTimeout(() => {
      cb();
      if (el) {
        el.style.transform = dir > 0 ? "translateX(16px)" : "translateX(-16px)";
        requestAnimationFrame(() => {
          if (el) {
            el.style.opacity = "1";
            el.style.transform = "translateX(0)";
          }
          setTimeout(() => setStepping(false), 220);
        });
      } else {
        setStepping(false);
      }
    }, 200);
  };

  const next = () => animateStep(1, () => setStep((s) => Math.min(s + 1, STEPS.length - 1)));
  const back = () => animateStep(-1, () => setStep((s) => Math.max(s - 1, 0)));

  async function handleResumePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResumeFileName(f.name);
    setResumeUploading(true);
    try {
      await uploadResume(f);
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleSkip() {
    // Persist anything they already entered so it shows up in Settings.
    // saveProfile toasts its own failure; skipping still proceeds.
    if (displayName.trim() || myLinkedInUrl.trim()) await saveProfile();
    completeOnboarding();
    toast.info("You can finish setting up your profile anytime in Settings.");
    onDone();
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      if (!(await saveProfile())) return;
      completeOnboarding();
      toast.success("You're in. Welcome to Coffee.");
      onDone();
    } finally {
      setFinishing(false);
    }
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-depth-0 px-4">
      {/* Background accents */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,229,255,0.05),transparent_60%)]" />
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_80%,rgba(124,77,255,0.03),transparent_50%)]" />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-10 flex justify-center auth-title-enter">
          <Logo size="sm" />
        </div>

        {/* Progress bar */}
        <div className="mb-8 auth-form-enter">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-white/25 tracking-wide uppercase">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-[11px] font-medium text-glow/50">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-glow/60 to-glow transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div ref={cardRef} style={{ transition: "opacity 0.2s, transform 0.2s" }}>
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-1.5">
              {currentStep.title}
            </h1>
            <p className="text-sm text-white/35">
              {currentStep.sub}
            </p>
          </div>

          {/* Step: Name */}
          {currentStep.key === "name" && (
            <div className="space-y-5">
              <FloatingInput
                label="Display name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="e.g. Bryce K."
              />
              <div className="flex items-center justify-between pt-1">
                <button className={skipBtn} onClick={handleSkip}>
                  Skip setup
                </button>
                <button
                  className={primaryBtn}
                  disabled={!canAdvanceName}
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: LinkedIn */}
          {currentStep.key === "linkedin" && (
            <div className="space-y-5">
              <FloatingInput
                label="LinkedIn URL"
                value={myLinkedInUrl}
                onChange={setMyLinkedInUrl}
                placeholder="https://linkedin.com/in/you"
              />
              <p className="text-[11px] text-white/25 px-1">
                Optional — you can add this later in Settings.
              </p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-4">
                  <button className={secondaryBtn} onClick={back}>
                    Back
                  </button>
                  <button className={skipBtn} onClick={handleSkip}>
                    Skip setup
                  </button>
                </div>
                <button className={primaryBtn} onClick={next}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Resume */}
          {currentStep.key === "resume" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] border-dashed p-5 text-center transition-all hover:border-glow/20 hover:bg-white/[0.04]">
                <svg
                  className="mx-auto h-7 w-7 text-white/15 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                  />
                </svg>
                <p className="text-xs text-white/30 mb-2">
                  {resumeFileName
                    ? `Uploaded: ${resumeFileName}`
                    : "Drop your resume here (PDF)"}
                </p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf"
                  className="block w-full text-xs text-white/40 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-glow/[0.08] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-glow hover:file:bg-glow/15"
                  onChange={handleResumePick}
                />
                {resumeUploading && (
                  <p className="mt-2 text-[11px] text-glow/60">Uploading…</p>
                )}
              </div>
              <p className="text-[11px] text-white/25 px-1">
                Optional — you can upload this later in Settings.
              </p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-4">
                  <button className={secondaryBtn} onClick={back}>
                    Back
                  </button>
                  <button className={skipBtn} onClick={handleSkip}>
                    Skip setup
                  </button>
                </div>
                <button
                  className={primaryBtn}
                  disabled={savingProfile || finishing || resumeUploading}
                  onClick={handleFinish}
                >
                  {finishing || savingProfile ? "Setting up…" : isLastStep ? "Enter Coffee" : "Continue"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
