import { SignIn, SignUp } from "@clerk/clerk-react";
import AuthIllustration from "../components/ui/AuthIllustration";
import Logo from "../components/ui/Logo";
import { SIGN_UP_PATH } from "../demo/mode";

const clerkAppearance = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "bg-transparent shadow-none border-0 px-0",
    headerTitle: "text-[22px] font-semibold tracking-tight text-white",
    headerSubtitle: "text-sm text-white/35",
    socialButtonsBlockButton:
      "border border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.07] hover:border-glow/30",
    socialButtonsBlockButtonText: "text-white/90 font-medium",
    dividerLine: "bg-white/[0.08]",
    dividerText: "text-white/25",
    formFieldLabel: "text-white/50",
    formFieldInput:
      "bg-white/[0.04] border border-white/[0.08] text-white focus:border-glow/40",
    formButtonPrimary:
      "bg-glow/15 text-glow hover:bg-glow/25 border border-glow/20 normal-case font-medium",
    footerActionText: "text-white/35",
    footerActionLink: "text-glow hover:text-glow",
    footer: "bg-transparent",
  },
};

/**
 * Clerk renders the form itself.
 *
 * Which methods appear -- Google, Microsoft, email -- is configured in Clerk's
 * dashboard, not here. That is the point of handing this over: adding a provider
 * stops being a code change, and the OAuth credentials, verification emails and
 * password resets are no longer ours to build or hold.
 *
 * /sign-up shows Clerk's sign-up form (the demo's "Sign up free" lands here); every
 * other signed-out URL shows sign-in. Each form links to the other. Either way, once
 * Clerk has a session, App's linkIdentity finds or creates the account.
 */
export default function AuthPage() {
  const isSignUp = typeof window !== "undefined" && window.location.pathname === SIGN_UP_PATH;

  return (
    <div className="relative flex min-h-screen text-white">
      {/* ── Left: illustration (desktop only) ── */}
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

      {/* ── Right: sign in / sign up ── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center relative">
        <div className="absolute inset-0 bg-depth-0 lg:bg-depth-0/95" />

        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <AuthIllustration />
          <div className="absolute inset-0 bg-depth-0/85" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[400px] px-6 py-12">
          <h1 className="sr-only">{isSignUp ? "Coffee — sign up" : "Coffee — sign in"}</h1>
          <div className="mb-6 flex justify-center lg:hidden auth-title-enter">
            <Logo size="lg" />
          </div>

          <div className="auth-form-enter">
            {isSignUp ? (
              <SignUp routing="hash" signInUrl="/" fallbackRedirectUrl="/" appearance={clerkAppearance} />
            ) : (
              <SignIn routing="hash" signUpUrl={SIGN_UP_PATH} appearance={clerkAppearance} />
            )}
          </div>

          <p className="mt-6 text-center text-sm text-white/60">
            Just looking?{" "}
            {/* A plain link, not router navigation: the demo is chosen at page load. */}
            <a href="/demo" className="font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white">
              See a demo
            </a>
          </p>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-white/25">
            We only ever read your name, email address and profile picture.
          </p>
        </div>
      </div>
    </div>
  );
}
