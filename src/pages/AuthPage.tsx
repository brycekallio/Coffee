import { SignIn } from "@clerk/clerk-react";
import AuthIllustration from "../components/ui/AuthIllustration";
import Logo from "../components/ui/Logo";

/**
 * Clerk renders the form itself.
 *
 * Which methods appear -- Google, Microsoft, email -- is configured in Clerk's
 * dashboard, not here. That is the point of handing this over: adding a provider
 * stops being a code change, and the OAuth credentials, verification emails and
 * password resets are no longer ours to build or hold.
 */
export default function AuthPage() {
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

      {/* ── Right: sign in ── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center relative">
        <div className="absolute inset-0 bg-depth-0 lg:bg-depth-0/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_70%_30%,rgba(0,229,255,0.04),transparent_70%)]" />

        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <AuthIllustration />
          <div className="absolute inset-0 bg-depth-0/85" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[400px] px-6 py-12">
          <div className="mb-6 flex justify-center lg:hidden auth-title-enter">
            <Logo size="lg" />
          </div>

          <div className="auth-form-enter">
            <SignIn
              routing="hash"
              appearance={{
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
              }}
            />
          </div>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/25">
            We only ever read your name, email address and profile picture.
          </p>
        </div>
      </div>
    </div>
  );
}
