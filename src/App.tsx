import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import { supabaseMisconfigured } from "./lib/supabase";
import { EmailTakenError, linkIdentity, type AppUser } from "./lib/appSession";
import Logo from "./components/ui/Logo";
import AuthPage from "./pages/AuthPage";
import { SessionContext } from "./app/session";
import AppShell from "./app/AppShell";
import { ContactsProvider } from "./features/contacts/ContactsProvider";
import { ProfileProvider } from "./features/profile/ProfileProvider";

/**
 * The auth gate. Clerk says who you are; linkIdentity maps that to the Supabase user
 * whose rows are yours, creating a fresh account the first time a new person signs up. Once both are known, the signed-in app mounts inside the
 * session-scoped providers — and unmounts on sign-out, discarding all of its state.
 */
export default function App() {
  const [session, setSession] = useState<{ user: AppUser } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!clerkLoaded) return;

    if (!isSignedIn || !clerkUser) {
      setSession(null);
      setAuthChecked(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const user = await linkIdentity({
          email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
          name: clerkUser.fullName ?? undefined,
          avatar_url: clerkUser.imageUrl ?? undefined,
        });
        if (cancelled) return;
        setSession({ user });

        // The desktop shell makes its own Supabase calls from the main process,
        // so it needs a token too. Re-sent on each sign-in; Clerk refreshes the
        // underlying session on its own.
        if (window.electronAPI) {
          const token = await getToken();
          if (token) window.electronAPI.setAuthSession(token);
        }
      } catch (e) {
        if (cancelled) return;
        // The email belongs to an account another Clerk sign-in already owns (say,
        // Google before, email code now). Signing out is deliberate: the alternative
        // is an empty app beside their real data, which reads as data loss.
        if (e instanceof EmailTakenError) {
          toast.error("That email already has a Coffee account. Sign in the way you did before.");
          void clerk.signOut();
        } else {
          toast.error("Couldn't load your account. Try signing in again.");
        }
        setSession(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkLoaded, isSignedIn, clerkUser?.id]);

  // After every hook has run: React needs the same hooks on every render, and
  // supabaseMisconfigured is a module-level constant, so gating only the output is safe.
  if (supabaseMisconfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-depth-0 p-8 text-white">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-danger">Configuration Error</h1>
          <p className="text-white/60">
            Required environment variables are missing. Set the following in your{" "}
            <code className="rounded-badge bg-white/[0.06] px-1.5 py-0.5 text-sm text-glow">.env.local</code> file:
          </p>
          <ul className="space-y-1 rounded-input bg-depth-1 p-4 text-left text-sm font-mono text-glow">
            <li>VITE_SUPABASE_URL</li>
            <li>VITE_SUPABASE_ANON_KEY</li>
          </ul>
          <p className="text-sm text-white/60">
            Copy <code className="rounded-badge bg-white/[0.06] px-1 py-0.5">.env.example</code> to{" "}
            <code className="rounded-badge bg-white/[0.06] px-1 py-0.5">.env.local</code> and fill in the values.
          </p>
        </div>
      </div>
    );
  }


  // Hold the first paint until the identity link has answered. Without this, anyone
  // with a valid session sees the sign-in screen for one frame.
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <div className="animate-pulse opacity-60"><Logo /></div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  return (
    <SessionContext.Provider value={session.user}>
      <ProfileProvider>
        <ContactsProvider>
          <AppShell onSignOut={() => clerk.signOut()} />
        </ContactsProvider>
      </ProfileProvider>
    </SessionContext.Provider>
  );
}
