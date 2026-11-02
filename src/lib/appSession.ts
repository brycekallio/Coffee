/**
 * Bridges a Clerk identity to the Supabase row that owns this person's data.
 *
 * Clerk's `sub` is its own user id ("user_2abc..."), but every row in this
 * database is keyed on a Supabase UUID. Two RPCs, tried in order:
 *
 *   1. `link_clerk_identity` binds the Clerk user to the account that already
 *      holds their verified email (the thirteen pre-Clerk accounts keep their
 *      contacts, applications and meetings this way) and returns its UUID, or
 *      null when no account holds that email.
 *   2. `create_clerk_account` runs only on that null: it creates a fresh, empty
 *      account for this Clerk user (sign-ups are open, decided 2026-11-02). It
 *      refuses, with SQLSTATE CF409, when the email belongs to an account a
 *      different Clerk user already claimed -- it never creates a second account
 *      beside someone's data and never takes one over.
 *
 * Both are idempotent and run on every sign-in, not just the first: a user on a
 * new device or after clearing storage should not depend on having been here
 * before. SQL: docs/migration_clerk_auth.sql and docs/migration_2026-11-02_open_signups.sql.
 */
import { supabase } from "./supabase";

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

/** The SQLSTATE `create_clerk_account` raises when the email is another Clerk user's. */
export const EMAIL_TAKEN_CODE = "CF409";

export class EmailTakenError extends Error {
  constructor() {
    super("This email address already belongs to a different Coffee sign-in.");
    this.name = "EmailTakenError";
  }
}

export async function linkIdentity(clerk: {
  email: string;
  name?: string;
  avatar_url?: string;
}): Promise<AppUser> {
  const { data, error } = await supabase.rpc("link_clerk_identity");
  if (error) throw error;

  // null means no account holds this email: a new user, so make them one.
  const id = data ?? (await createAccount());
  return { id, email: clerk.email, name: clerk.name, avatar_url: clerk.avatar_url };
}

async function createAccount(): Promise<string> {
  const { data, error } = await supabase.rpc("create_clerk_account");
  if (error) {
    if (error.code === EMAIL_TAKEN_CODE) throw new EmailTakenError();
    throw error;
  }
  if (!data) throw new Error("Account creation returned no id.");
  return data;
}

/**
 * The current user's Supabase id, for the handful of places that insert rows
 * without the session threaded down to them.
 *
 * Cached for the life of the page: the mapping cannot change while signed in,
 * and without this every insert would cost an extra round trip. Cleared on sign
 * out so a second user on the same browser never inherits the first one's id.
 */
let cachedId: string | null = null;

export async function currentUserId(): Promise<string | null> {
  if (cachedId) return cachedId;
  const { data, error } = await supabase.rpc("link_clerk_identity");
  if (error || !data) return null;
  cachedId = data as string;
  return cachedId;
}

export function clearCachedUserId(): void {
  cachedId = null;
}
