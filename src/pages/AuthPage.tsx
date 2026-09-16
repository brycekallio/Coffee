import { useState, useRef } from "react";
import AuthIllustration from "../components/ui/AuthIllustration";
import Logo from "../components/ui/Logo";

interface AuthPageProps {
  authEmail: string;
  setAuthEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  resetSent: boolean;
  setResetSent: (v: boolean) => void;
  resettingPw: boolean;
  signIn: () => void;
  signUp: () => void;
  requestPasswordReset: () => void;
  signupName: string;
  setSignupName: (v: string) => void;
  signupPhone: string;
  setSignupPhone: (v: string) => void;
  signupLinkedIn: string;
  setSignupLinkedIn: (v: string) => void;
  signupCareerInterests: string;
  setSignupCareerInterests: (v: string) => void;
  setSignupResumeFile: (v: File | null) => void;
}

/* ── Floating label input ── */
function FloatingInput({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
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
        className="auth-input peer w-full rounded-xl bg-white/[0.03] px-4 pb-2.5 pt-5 text-sm text-white outline-none transition-all duration-300 border border-white/[0.06] focus:border-glow/40 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(0,229,255,0.08)]"
        placeholder=" "
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

/* ── Step indicator dots ── */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ${
            i === current
              ? "w-6 bg-glow shadow-[0_0_8px_rgba(0,229,255,0.5)]"
              : i < current
                ? "w-1.5 bg-glow/40"
                : "w-1.5 bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

export default function AuthPage({
  authEmail,
  setAuthEmail,
  password,
  setPassword,
  resetSent,
  setResetSent,
  resettingPw,
  signIn,
  signUp,
  requestPasswordReset,
  signupName,
  setSignupName,
  signupPhone,
  setSignupPhone,
  signupLinkedIn,
  setSignupLinkedIn,
  signupCareerInterests,
  setSignupCareerInterests,
  setSignupResumeFile,
}: AuthPageProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState(0); // 0: account, 1: profile, 2: resume+interests
  const [stepping, setStepping] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Animate step transitions */
  const animateStep = (dir: 1 | -1, cb: () => void) => {
    if (stepping) return;
    setStepping(true);
    const el = formRef.current;
    if (el) {
      el.style.transition = "opacity 0.2s, transform 0.2s";
      el.style.opacity = "0";
      el.style.transform = dir > 0 ? "translateX(-12px)" : "translateX(12px)";
    }
    setTimeout(() => {
      cb();
      if (el) {
        el.style.transform = dir > 0 ? "translateX(12px)" : "translateX(-12px)";
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

  const nextStep = () => animateStep(1, () => setSignupStep((s) => Math.min(s + 1, 2)));
  const prevStep = () => animateStep(-1, () => setSignupStep((s) => Math.max(s - 1, 0)));

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setSignupStep(0);
    setResumeFileName(null);
  }

  const canAdvanceStep0 =
    signupName.trim().length > 0 &&
    authEmail.trim().length > 0 &&
    password.trim().length >= 6;

  // Phone + LinkedIn are optional — users can fill them in Settings after signing up
  const canAdvanceStep1 = true;

  // Resume is optional — can be uploaded later in Settings
  const canSubmit = true;

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      setResumeFileName(f.name);
      setSignupResumeFile(f);
    } else {
      setResumeFileName(null);
      setSignupResumeFile(null);
    }
  }

  function handleCreateAccount() {
    signUp();
  }

  const primaryBtnCls =
    "w-full rounded-xl bg-glow px-4 py-3 text-sm font-semibold text-depth-0 shadow-[0_0_30px_rgba(0,229,255,0.2)] transition-all duration-300 hover:shadow-[0_0_40px_rgba(0,229,255,0.35)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-none cursor-pointer";

  const ghostBtnCls =
    "w-full rounded-xl bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/60 transition-all duration-200 hover:bg-white/[0.08] hover:text-white cursor-pointer";

  const tabCls = (active: boolean) =>
    `flex-1 py-2 text-sm font-medium text-center rounded-lg transition-all duration-300 cursor-pointer ${
      active
        ? "bg-glow/10 text-glow shadow-[inset_0_0_12px_rgba(0,229,255,0.06)]"
        : "text-white/35 hover:text-white/55 hover:bg-white/[0.03]"
    }`;

  return (
    <div className="relative flex min-h-screen text-white">
      {/* ── Left: Illustration (desktop only) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <AuthIllustration />
        <div className="relative z-10 max-w-md px-12 auth-hero-enter">
          <div className="text-glow mb-4">
            <Logo size="lg" />
          </div>
          <p className="text-lg text-white/40 leading-relaxed mt-6">
            Your career network, organized.<br />
            <span className="text-white/25">Track contacts, outreach, and applications in one place.</span>
          </p>
        </div>
      </div>

      {/* ── Right: Form ── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center relative">
        <div className="absolute inset-0 bg-depth-0 lg:bg-depth-0/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_70%_30%,rgba(0,229,255,0.04),transparent_70%)]" />

        {/* Mobile-only illustration */}
        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <AuthIllustration />
          <div className="absolute inset-0 bg-depth-0/85" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[380px] px-6 py-12">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden auth-title-enter">
            <Logo size="lg" />
          </div>

          {/* Mode toggle */}
          <div className="auth-form-enter mb-6 flex gap-1 rounded-xl bg-white/[0.04] p-1 backdrop-blur-sm">
            <button className={tabCls(mode === "signin")} onClick={() => switchMode("signin")}>
              Sign In
            </button>
            <button className={tabCls(mode === "signup")} onClick={() => switchMode("signup")}>
              Sign Up
            </button>
          </div>

          {/* ── Sign In Form ── */}
          {mode === "signin" && (
            <div className="auth-form-enter space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
                <p className="text-sm text-white/30">Sign in to your Coffee account</p>
              </div>

              <div className="space-y-3">
                <FloatingInput
                  label="Email"
                  type="email"
                  value={authEmail}
                  onChange={(v) => { setAuthEmail(v); if (resetSent) setResetSent(false); }}
                />
                <FloatingInput
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(v) => { setPassword(v); if (resetSent) setResetSent(false); }}
                />
              </div>

              <button onClick={signIn} className={primaryBtnCls}>
                Sign In
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={requestPasswordReset}
                  disabled={resettingPw}
                  className="text-xs font-medium text-white/30 transition-colors hover:text-glow disabled:opacity-50 cursor-pointer"
                >
                  {resettingPw ? "Sending..." : "Forgot password?"}
                </button>
                {resetSent && (
                  <span className="text-xs text-glow/60 animate-pulse">Check your inbox</span>
                )}
              </div>

              <div className="pt-4 text-center">
                <button
                  onClick={() => switchMode("signup")}
                  className="text-sm text-white/30 transition-colors hover:text-white/60 cursor-pointer"
                >
                  Don't have an account?{" "}
                  <span className="font-medium text-glow/70 hover:text-glow">Create one</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Sign Up Flow (Multi-step) ── */}
          {mode === "signup" && (
            <div className="auth-form-enter">
              {/* Step dots */}
              <div className="mb-5">
                <StepDots total={3} current={signupStep} />
              </div>

              <div ref={formRef} style={{ transition: "opacity 0.2s, transform 0.2s" }}>

                {/* Step 0: Account basics */}
                {signupStep === 0 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1">Create your account</h2>
                      <p className="text-sm text-white/30">Let's start with the basics</p>
                    </div>

                    <div className="space-y-3">
                      <FloatingInput label="Full name" value={signupName} onChange={setSignupName} />
                      <FloatingInput
                        label="Email"
                        type="email"
                        value={authEmail}
                        onChange={(v) => { setAuthEmail(v); if (resetSent) setResetSent(false); }}
                      />
                      <FloatingInput
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(v) => { setPassword(v); if (resetSent) setResetSent(false); }}
                      />
                      {password.length > 0 && password.length < 6 && (
                        <p className="text-xs text-danger/70 pl-1">At least 6 characters</p>
                      )}
                    </div>

                    <button onClick={nextStep} disabled={!canAdvanceStep0} className={primaryBtnCls}>
                      Continue
                    </button>
                  </div>
                )}

                {/* Step 1: Profile info (all optional) */}
                {signupStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1">Your profile</h2>
                      <p className="text-sm text-white/30">Optional — you can fill these in later from Settings</p>
                    </div>

                    <div className="space-y-3">
                      <FloatingInput label="Phone number (optional)" value={signupPhone} onChange={setSignupPhone} />
                      <FloatingInput label="LinkedIn URL (optional)" value={signupLinkedIn} onChange={setSignupLinkedIn} />
                    </div>

                    <div className="flex gap-3">
                      <button onClick={prevStep} className={ghostBtnCls}>Back</button>
                      <button onClick={nextStep} disabled={!canAdvanceStep1} className={primaryBtnCls}>
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Resume (optional) + Career interests */}
                {signupStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1">Upload your resume</h2>
                      <p className="text-sm text-white/30">
                        Optional — powers the JD Scorer. You can upload later in Settings.
                      </p>
                    </div>

                    {/* Resume upload — required */}
                    <div
                      className={`rounded-xl border p-4 transition-all cursor-pointer ${
                        resumeFileName
                          ? "border-glow/30 bg-glow/[0.04]"
                          : "border-white/[0.08] border-dashed bg-white/[0.02] hover:border-glow/20 hover:bg-white/[0.04]"
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={handleResumeChange}
                      />

                      {resumeFileName ? (
                        /* File selected state */
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-glow/10">
                            <svg className="h-5 w-5 text-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-glow truncate">{resumeFileName}</p>
                            <p className="text-xs text-white/35 mt-0.5">Click to replace</p>
                          </div>
                          <svg className="h-4 w-4 flex-shrink-0 text-glow/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        /* Empty state */
                        <div className="flex flex-col items-center py-2 text-center">
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                            <svg className="h-5 w-5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-white/50">Click to upload your resume</p>
                          <p className="text-xs mt-0.5 text-white/25">PDF only · Optional</p>
                        </div>
                      )}
                    </div>

                    {/* Career interests (optional) */}
                    <div className="relative">
                      <textarea
                        className="auth-input w-full rounded-xl bg-white/[0.03] px-4 pb-3 pt-5 text-sm text-white placeholder:text-white/20 outline-none transition-all duration-300 border border-white/[0.06] focus:border-glow/40 focus:bg-white/[0.06] min-h-[72px] resize-y"
                        placeholder="e.g. Product Management, UX Design, Software Engineering..."
                        value={signupCareerInterests}
                        onChange={(e) => setSignupCareerInterests(e.target.value)}
                      />
                      <label className="pointer-events-none absolute left-4 top-1.5 text-[10px] font-medium text-white/35">
                        Career interests (optional)
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={prevStep} className={ghostBtnCls}>Back</button>
                      <button
                        onClick={handleCreateAccount}
                        disabled={!canSubmit}
                        className={primaryBtnCls}
                      >
                        Create Account
                      </button>
                    </div>

                    <p className="text-center text-xs text-white/20">
                      You can upload or change your resume anytime in Settings
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-5 text-center">
                <button
                  onClick={() => switchMode("signin")}
                  className="text-sm text-white/30 transition-colors hover:text-white/60 cursor-pointer"
                >
                  Already have an account?{" "}
                  <span className="font-medium text-glow/70 hover:text-glow">Sign In</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
