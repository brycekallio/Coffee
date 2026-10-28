import { createContext, useContext } from "react";
import type { AppUser } from "@/lib/appSession";

/**
 * The signed-in user, for everything rendered behind the auth gate.
 *
 * App resolves the Clerk session to a Supabase user (see linkIdentity) and provides it
 * here, so a feature hook can scope inserts to `user.id` without it being threaded
 * through every page's props. Outside the provider there is no user, and useSession
 * throws rather than returning null — a feature rendered there is a bug.
 */
export const SessionContext = createContext<AppUser | null>(null);

export function useSession(): AppUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession() called outside the signed-in app");
  return user;
}
