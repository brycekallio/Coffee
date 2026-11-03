import { SignIn, SignUp } from "@clerk/clerk-react";
import AuthIllustration from "../components/ui/AuthIllustration";
import Logo from "../components/ui/Logo";
import { SIGN_UP_PATH } from "../demo/mode";

/**
 * Everything Clerk draws on this page is styled from here, as `variables` (the palette Clerk
 * derives all its colours from) plus `elements` style objects.
 *
 * Why not Tailwind classes: Tailwind 4 puts its utilities in a CSS layer, and Clerk's own
 * unlayered styles beat any layered rule, so a class like `text-white` on an element is
 * silently ignored. (That is how the email-code digits ended up near-black on a near-black
 * box, and how the GitHub mark went invisible.) Style objects are injected by Clerk itself
 * and win. The variables below are the real fix for contrast: Clerk's defaults are a light
 * theme, so any element we do not restyle must still inherit light-on-dark.
 *
 * Contrast (all on depth-1 #0B1F2A unless noted): white text 15:1, secondary text
 * rgba(255,255,255,.7) about 9:1, input text white on a 6% white box about 13:1, cyan
 * button label depth-0 on #00E5FF 12:1, error #FF6B6B about 6:1.
 */
const DEPTH_0 = "#081418";
const DEPTH_1 = "#0B1F2A";
const GLOW = "#00E5FF";
const DANGER = "#FF6B6B";
const TEXT_2 = "rgba(255,255,255,0.7)";
const FIELD_BG = "rgba(255,255,255,0.06)";
const FIELD_BORDER = "rgba(255,255,255,0.14)";

const socialButton = {
  backgroundColor: "rgba(255,255,255,0.08)",
  boxShadow: "none !important",
  border: "none",
  color: "#ffffff",
  "&:hover": { backgroundColor: "rgba(255,255,255,0.13)" },
  "&:focus-visible": { boxShadow: "0 0 0 2px rgba(0,229,255,0.6) !important" },
};

const fieldBox = {
  backgroundColor: FIELD_BG,
  border: `1px solid ${FIELD_BORDER}`,
  color: "#ffffff",
  boxShadow: "none !important",
  "&:focus, &:focus-within": { borderColor: "rgba(0,229,255,0.6)", boxShadow: "none !important" },
};

const clerkAppearance = {
  variables: {
    colorBackground: DEPTH_1,
    colorText: "#ffffff",
    colorTextSecondary: TEXT_2,
    colorPrimary: GLOW,
    colorTextOnPrimaryBackground: DEPTH_0,
    colorNeutral: "#ffffff",
    colorInputBackground: FIELD_BG,
    colorInputText: "#ffffff",
    colorDanger: DANGER,
    colorSuccess: "#00FFC6",
    colorShimmer: "rgba(255,255,255,0.1)",
    fontFamily: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", borderRadius: "1rem", backgroundColor: DEPTH_1 },
    card: { backgroundColor: DEPTH_1, boxShadow: "none", border: "none", borderRadius: "1rem" },
    // Clerk's footer ships a light-on-dark gradient and a hairline; keep it one flat surface.
    footer: { backgroundColor: DEPTH_1, backgroundImage: "none", border: "none", "& > *": { borderTop: "none" } },
    footerAction: { border: "none", backgroundImage: "none" },
    headerTitle: { fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", color: "#ffffff" },
    headerSubtitle: { fontSize: "14px", color: TEXT_2 },
    socialButtonsIconButton: socialButton,
    socialButtonsBlockButton: socialButton,
    socialButtonsBlockButtonText: { color: "#ffffff", fontWeight: 500 },
    // GitHub's mark ships black; flip it to white on the dark card.
    socialButtonsProviderIcon__github: { filter: "invert(1)" },
    dividerLine: { backgroundColor: "rgba(255,255,255,0.12)" },
    dividerText: { color: TEXT_2 },
    formFieldLabel: { color: "rgba(255,255,255,0.85)" },
    formFieldInput: { ...fieldBox, "&::placeholder": { color: "rgba(255,255,255,0.5)" } },
    formFieldInputShowPasswordButton: { color: TEXT_2, "&:hover": { color: "#ffffff" } },
    formFieldHintText: { color: TEXT_2 },
    formFieldSuccessText: { color: "#00FFC6" },
    formFieldErrorText: { color: DANGER },
    formFieldInfoText: { color: TEXT_2 },
    formFieldAction: { color: "#ffffff", textDecoration: "underline" },
    // Email / phone code step: the six digit boxes and their digits.
    otpCodeFieldInput: { ...fieldBox, fontSize: "18px", fontWeight: 600 },
    otpCodeFieldErrorText: { color: DANGER },
    formResendCodeLink: { color: "#ffffff", textDecoration: "underline" },
    identityPreviewText: { color: "#ffffff" },
    identityPreviewEditButton: { color: "#ffffff" },
    backLink: { color: "#ffffff" },
    alert: { backgroundColor: "rgba(255,107,107,0.12)", border: "none" },
    alertText: { color: "#ffffff" },
    formButtonPrimary: {
      backgroundColor: GLOW,
      color: DEPTH_0,
      fontWeight: 600,
      textTransform: "none",
      boxShadow: "none !important",
      "&:hover, &:focus": { backgroundColor: "#4DEEFF", boxShadow: "none !important" },
      "&:focus-visible": { boxShadow: "0 0 0 2px rgba(255,255,255,0.8) !important" },
    },
    footerActionText: { color: TEXT_2 },
    footerActionLink: { color: "#ffffff", fontWeight: 500, textDecoration: "underline", "&:hover": { color: "#ffffff" } },
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
  // The Electron build loads over file://, where "/sign-up" and "/demo" would be paths on
  // disk. There, sign-up falls back to Clerk's hosted page and the demo link is hidden.
  const isDesktopFile = typeof window !== "undefined" && window.location.protocol === "file:";

  return (
    <div className="min-h-dvh bg-depth-0 text-white lg:grid lg:grid-cols-2">
      {/* ── Left on desktop / band above the card on phones: logo, line, pour illustration ──
          The illustration is a normal block in this column, so it can never sit under the form. */}
      <aside className="flex items-center justify-between gap-4 px-6 pb-2 pt-8 lg:h-dvh lg:flex-col lg:items-start lg:justify-start lg:gap-10 lg:px-16 lg:pb-12 lg:pt-16">
        <div className="auth-title-enter">
          <div className="text-glow">
            <Logo size="lg" align="start" />
          </div>
          <p className="mt-6 hidden max-w-sm text-lg leading-relaxed text-white/70 lg:block">
            Your career network, organized.
            <br />
            <span className="text-white/60">Track contacts, outreach, and applications in one place.</span>
          </p>
        </div>
        <AuthIllustration className="auth-hero-enter h-auto w-[46%] max-w-[190px] shrink-0 lg:h-auto lg:min-h-0 lg:w-full lg:max-w-[560px] lg:flex-1 lg:self-center" />
      </aside>

      {/* ── Right: sign in / sign up ── */}
      <main className="flex items-center justify-center px-6 py-8 lg:min-h-dvh lg:py-12">
        <div className="w-full max-w-[400px]">
          <h1 className="sr-only">{isSignUp ? "Coffee — sign up" : "Coffee — sign in"}</h1>

          <div className="auth-form-enter">
            {isSignUp ? (
              <SignUp routing="hash" signInUrl="/" fallbackRedirectUrl="/" appearance={clerkAppearance} />
            ) : (
              <SignIn
                routing="hash"
                signUpUrl={isDesktopFile ? undefined : SIGN_UP_PATH}
                appearance={clerkAppearance}
              />
            )}
          </div>

          {!isDesktopFile && (
            <p className="mt-6 text-center text-sm text-white/70">
              Just looking?{" "}
              {/* A plain link, not router navigation: the demo is chosen at page load. */}
              <a href="/demo" className="font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white">
                See a demo
              </a>
            </p>
          )}

          <p className="mt-4 text-center text-xs leading-relaxed text-white/60">
            We only ever read your name, email address and profile picture.
          </p>
        </div>
      </main>
    </div>
  );
}
