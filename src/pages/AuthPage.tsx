import type { ReactElement } from "react";
import AuthIllustration from "../components/ui/AuthIllustration";
import Logo from "../components/ui/Logo";
import { PROVIDER_HINT, PROVIDER_LABEL, type AuthProvider } from "../lib/authClient";

interface AuthPageProps {
  onSignIn: (provider: AuthProvider) => void;
  /** Non-null while a redirect is in flight, so neither button can be double-clicked. */
  signingInWith: AuthProvider | null;
}

/* Brand marks are inline rather than fetched: a sign-in button that waits on a
   third-party CDN is a sign-in button that sometimes renders blank. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#F25022" d="M0 0h8.5v8.5H0z"/>
      <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z"/>
      <path fill="#00A4EF" d="M0 9.5h8.5V18H0z"/>
      <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z"/>
    </svg>
  );
}

const MARKS: Record<AuthProvider, () => ReactElement> = {
  google: GoogleMark,
  microsoft: MicrosoftMark,
};

function ProviderButton({
  provider,
  onSignIn,
  busy,
  disabled,
}: {
  provider: AuthProvider;
  onSignIn: (p: AuthProvider) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const Mark = MARKS[provider];
  return (
    <button
      type="button"
      onClick={() => onSignIn(provider)}
      disabled={disabled}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-left transition-all duration-200 hover:border-glow/30 hover:bg-white/[0.07] focus:border-glow/40 focus:outline-none focus:ring-1 focus:ring-glow/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
        <Mark />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">
          Continue with {PROVIDER_LABEL[provider]}
        </span>
        <span className="block text-[11px] text-white/30">{PROVIDER_HINT[provider]}</span>
      </span>
      {busy && (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-glow/30 border-t-glow" />
      )}
    </button>
  );
}

export default function AuthPage({ onSignIn, signingInWith }: AuthPageProps) {
  const busy = signingInWith !== null;

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

      {/* ── Right: Sign in ── */}
      <div className="flex w-full lg:w-1/2 items-center justify-center relative">
        <div className="absolute inset-0 bg-depth-0 lg:bg-depth-0/95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_70%_30%,rgba(0,229,255,0.04),transparent_70%)]" />

        <div className="absolute inset-0 lg:hidden overflow-hidden">
          <AuthIllustration />
          <div className="absolute inset-0 bg-depth-0/85" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[380px] px-6 py-12">
          <div className="mb-8 flex justify-center lg:hidden auth-title-enter">
            <Logo size="lg" />
          </div>

          <div className="auth-title-enter mb-7">
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Sign in to Coffee</h1>
            {/* No separate sign-up path on purpose: with a provider redirect the
                first sign-in IS the sign-up, and offering both would just be two
                buttons that do the same thing. */}
            <p className="mt-1.5 text-sm text-white/35">
              New here? Signing in creates your account.
            </p>
          </div>

          <div className="auth-form-enter space-y-3">
            {/* Microsoft first: colorado.edu is a Microsoft tenant, so for Coffee's
                audience — CU freshmen and sophomores — this is the one that works. */}
            <ProviderButton
              provider="microsoft"
              onSignIn={onSignIn}
              busy={signingInWith === "microsoft"}
              disabled={busy}
            />
            <ProviderButton
              provider="google"
              onSignIn={onSignIn}
              busy={signingInWith === "google"}
              disabled={busy}
            />
          </div>

          <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25">
            We only ever read your name, email address and profile picture.
            Coffee never sees your password and cannot read your mail.
          </p>
        </div>
      </div>
    </div>
  );
}
