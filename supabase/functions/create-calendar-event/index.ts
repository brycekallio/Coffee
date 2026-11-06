import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createCalendarEvent, type ProfilesDb } from "./event.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Resolve the user through app_user_id(), not auth.getUser(). getUser asks
    // GoTrue, which has never seen a Clerk token and answers 401 for every real
    // user. app_user_id() is the same function every RLS policy uses, so this
    // cannot disagree with what the database enforces a moment later.
    const { data: appUserId, error: userError } = await userClient.rpc("app_user_id");
    if (userError || !appUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Everything after auth lives in event.ts ───────────────────────────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const out = await createCalendarEvent(appUserId as string, () => req.json(), {
      fetch,
      service: serviceClient as unknown as ProfilesDb,
      googleClientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
      googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    });
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
