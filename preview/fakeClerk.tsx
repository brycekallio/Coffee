/* eslint-disable react-refresh/only-export-components -- stands in for a library module, not a component file */
// Stand-in for @clerk/clerk-react in the preview harness: always signed in as the
// sample student, unless the URL carries ?signedOut, which shows the real AuthPage.
import type { ReactNode } from "react";
import { USER } from "../src/demo/sampleData";

const signedIn = !new URLSearchParams(window.location.search).has("signedOut");

const user = {
  id: "user_preview",
  fullName: USER.name,
  imageUrl: undefined,
  primaryEmailAddress: { emailAddress: USER.email },
};

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function useUser() {
  return { isLoaded: true, isSignedIn: signedIn, user: signedIn ? user : null };
}
export function useAuth() {
  return { getToken: async () => null };
}
export function useClerk() {
  return { signOut: async () => window.location.assign("/?signedOut") };
}
/** Clerk's hosted form, approximated so the sign-in screen has its real footprint. */
export function SignIn() {
  return (
    <div style={{ width: 400, padding: 32, borderRadius: 16, background: "#0b1420", color: "#fff", font: "14px system-ui" }}>
      <p style={{ fontSize: 17, fontWeight: 600, margin: 0, textAlign: "center" }}>Sign in to Coffee</p>
      <p style={{ opacity: 0.7, textAlign: "center" }}>Welcome back! Please sign in to continue</p>
      <div style={{ height: 40, borderRadius: 8, background: "rgba(255,255,255,.06)", margin: "24px 0 16px" }} />
      <div style={{ height: 40, borderRadius: 8, background: "#00e5ff" }} />
    </div>
  );
}
/** Sign-up form stand-in (AuthPage imports it); same footprint as SignIn. */
export function SignUp() {
  return <SignIn />;
}
