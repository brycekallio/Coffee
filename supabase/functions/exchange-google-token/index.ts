import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { exchangeAndStore } from "./exchange.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth: get the calling user ──────────────────────────────────────────
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

    // Verify the user JWT
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

    // ── Parse body ───────────────────────────────────────────────────────────
    const { code, redirect_uri } = await req.json() as { code: string; redirect_uri: string };
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: "code and redirect_uri are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Exchange code for tokens with Google, store them ─────────────────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const out = await exchangeAndStore(
      {
        code,
        redirectUri: redirect_uri,
        userId: appUserId,
        clientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
        clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      },
      { fetch, service: serviceClient },
    );
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
