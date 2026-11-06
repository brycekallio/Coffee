import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { disconnectGoogle, type ProfilesDb } from "./disconnect.ts";

// verify_jwt is off (Clerk tokens aren't Supabase JWTs); the caller is resolved in-function
// through app_user_id(), exactly like exchange-google-token.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: appUserId, error: userError } = await userClient.rpc("app_user_id");
    if (userError || !appUserId) return json({ error: "Unauthorized" }, 401);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const out = await disconnectGoogle(appUserId as string, { fetch, service: service as unknown as ProfilesDb });
    return json(out.body, out.status);
  } catch (err: unknown) {
    // The message could quote a token (a failing row): log the kind only.
    console.error("google-disconnect failed", err instanceof Error ? err.name : typeof err);
    return json({ error: "Couldn't disconnect Google. Try again." }, 500);
  }
});
