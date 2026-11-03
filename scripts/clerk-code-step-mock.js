// Dev-only helper for screenshots, never imported by the app.
//
// Why it exists: Clerk's email-code step ("Verify your email") can only be reached by a real
// sign-up, and Cloudflare Turnstile blocks automated browsers from finishing one. This puts
// Clerk's REAL <SignUp> component into that step without any request to Clerk: it hands the
// already-loaded Clerk a client whose sign-up is waiting for an unverified email, then moves
// the hash router to the code step.
//
// Use: open http://localhost:5173/sign-up in the browser, then run this file's contents in
// the console (or chrome-devtools `evaluate_script` with `format: "script"`). Typing a full
// 6-digit code makes Clerk call its real API with a fake id, which returns an error and
// shows Clerk's error state under the boxes (also worth a screenshot).
(async () => {
  const C = window.Clerk;
  const now = Date.now();
  const signUp = {
    object: "sign_up_attempt",
    id: "sua_mock",
    status: "missing_requirements",
    required_fields: ["email_address", "password"],
    optional_fields: [],
    missing_fields: [],
    unverified_fields: ["email_address"],
    verifications: {
      email_address: { status: "unverified", strategy: "email_code", attempts: null, expire_at: now + 600000 },
      phone_number: null,
      web3_wallet: null,
      external_account: null,
    },
    username: null,
    email_address: "you@example.com",
    phone_number: null,
    web3_wallet: null,
    password_enabled: true,
    first_name: null,
    last_name: null,
    unsafe_metadata: {},
    public_metadata: {},
    custom_action: false,
    external_id: null,
    created_session_id: null,
    created_user_id: null,
    abandon_at: now + 86400000,
  };
  const client = {
    object: "client",
    id: "client_mock",
    sessions: [],
    sign_in: null,
    sign_up: signUp,
    last_active_session_id: null,
    cookie_expires_at: null,
    created_at: now,
    updated_at: now,
  };
  C.updateClient(new C.client.constructor(client));
  location.hash = "#/verify-email-address";
})();
