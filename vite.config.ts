import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Fail a production build whose Supabase env is empty.
 *
 * Vite inlines import.meta.env.VITE_* at build time. Netlify runs `npm run build` (not
 * `verify`/`preflight`), so a missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY used to
 * build clean and ship the "misconfigured" screen to every user. A failed build keeps the
 * previous deploy live instead.
 *
 * Clerk is different: src/main.tsx falls back to a committed pk_test_ key when
 * VITE_CLERK_PUBLISHABLE_KEY is unset, so the app is never stripped from the bundle and
 * the build is allowed to proceed. It warns, because a production bundle on the test
 * Clerk instance is almost never intended.
 */
export function checkBuildEnv(env: Record<string, string | undefined>): { errors: string[]; warnings: string[] } {
  const errors = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]
    .filter((k) => !env[k]?.trim())
    .map((k) => `${k} is empty or unset.`);
  const warnings: string[] = [];
  const clerk = env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!clerk) warnings.push("VITE_CLERK_PUBLISHABLE_KEY is empty: the build will use the committed pk_test_ fallback.");
  else if (clerk.startsWith("pk_test_")) warnings.push("VITE_CLERK_PUBLISHABLE_KEY is a pk_test_ (development) key.");
  return { errors, warnings };
}

function buildEnvGuard(): Plugin {
  return {
    name: "coffee-build-env-guard",
    config(_config, { command, mode }) {
      if (command !== "build" || mode !== "production") return;
      const { errors, warnings } = checkBuildEnv(loadEnv(mode, process.cwd(), "VITE_"));
      for (const w of warnings) console.warn(`\n[build-env] warning: ${w}`);
      if (errors.length > 0) {
        throw new Error(
          `Production build refused:\n  - ${errors.join("\n  - ")}\n` +
            "Set them in .env.local locally, or in the Netlify site's environment variables.",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [buildEnvGuard(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendors change far less often than app code. Giving the big ones their own
        // chunks means a deploy invalidates only the app chunk in returning users' caches.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("@clerk/")) return "clerk";
          if (id.includes("@supabase/")) return "supabase";
        },
      },
    },
  },
});
