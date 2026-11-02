import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The sign-in path, now that sign-ups are open (2026-11-02):
 *   - an existing account is linked and nothing is created,
 *   - a new person gets an account created, exactly once,
 *   - an email another Clerk user already owns is refused, never duplicated or taken over,
 *   - a database error during linking never falls through to creating an account.
 * The SQL side (RLS, takeover refusal, idempotence) was probed against the live database
 * in a rolled-back transaction; see docs/migration_2026-11-02_open_signups.sql.
 */

type RpcReply = { data: string | null; error: { message: string; code?: string } | null };
const replies: Record<string, RpcReply> = {};
const rpc = vi.fn(async (name: string) => replies[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } });

vi.mock("./supabase", () => ({ supabase: { rpc: (name: string) => rpc(name) } }));

const { linkIdentity, EmailTakenError, EMAIL_TAKEN_CODE, currentUserId, clearCachedUserId } = await import("./appSession");

const CLERK = { email: "student@colorado.edu", name: "Sam Student", avatar_url: "https://img.clerk.com/a.png" };
const EXISTING = "11111111-1111-4111-8111-111111111111";
const CREATED = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  rpc.mockClear();
  for (const k of Object.keys(replies)) delete replies[k];
  clearCachedUserId();
});

describe("linkIdentity", () => {
  it("links an existing account and never calls create", async () => {
    replies.link_clerk_identity = { data: EXISTING, error: null };
    const user = await linkIdentity(CLERK);
    expect(user).toEqual({ id: EXISTING, ...CLERK });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["link_clerk_identity"]);
  });

  it("creates an account for a new person when no account holds their email", async () => {
    replies.link_clerk_identity = { data: null, error: null };
    replies.create_clerk_account = { data: CREATED, error: null };
    const user = await linkIdentity(CLERK);
    expect(user.id).toBe(CREATED);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["link_clerk_identity", "create_clerk_account"]);
  });

  it("after sign-up, later sign-ins resolve through link alone", async () => {
    // create_clerk_account stores the Clerk id, so link_clerk_identity finds it next time.
    replies.link_clerk_identity = { data: CREATED, error: null };
    await linkIdentity(CLERK);
    expect(await currentUserId()).toBe(CREATED);
    expect(rpc.mock.calls.every((c) => c[0] === "link_clerk_identity")).toBe(true);
  });

  it("refuses an email that another Clerk sign-in already owns", async () => {
    replies.link_clerk_identity = { data: null, error: null };
    replies.create_clerk_account = {
      data: null,
      error: { message: "email already belongs to another account", code: EMAIL_TAKEN_CODE },
    };
    await expect(linkIdentity(CLERK)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("does not create an account when linking itself failed", async () => {
    replies.link_clerk_identity = { data: null, error: { message: "JWT expired", code: "PGRST301" } };
    await expect(linkIdentity(CLERK)).rejects.toMatchObject({ message: "JWT expired" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["link_clerk_identity"]);
  });

  it("surfaces other creation errors as they are, not as email-taken", async () => {
    replies.link_clerk_identity = { data: null, error: null };
    replies.create_clerk_account = { data: null, error: { message: "session token is missing sub or email", code: "P0001" } };
    const err = await linkIdentity(CLERK).catch((e) => e);
    expect(err).not.toBeInstanceOf(EmailTakenError);
    expect(err.message).toBe("session token is missing sub or email");
  });

  it("treats a create that returns no id as a failure, never a session with no user", async () => {
    replies.link_clerk_identity = { data: null, error: null };
    replies.create_clerk_account = { data: null, error: null };
    await expect(linkIdentity(CLERK)).rejects.toThrow(/no id/);
  });
});
