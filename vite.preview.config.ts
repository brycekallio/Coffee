import path from "path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config";

/**
 * Local preview harness: the real app, signed in as a sample student, backed by an
 * in-memory fake of Supabase. Never touches the real project and is never built for
 * Netlify (npm run build uses vite.config.ts). Run with `npm run preview:ui`.
 */
const realSupabase = path.resolve(__dirname, "src/lib/supabase.ts");

function swapModules(): Plugin {
  return {
    name: "coffee-preview-swap",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source === "@clerk/clerk-react") return path.resolve(__dirname, "preview/fakeClerk.tsx");
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved?.id === realSupabase) return path.resolve(__dirname, "preview/fakeSupabase.ts");
      return null;
    },
  };
}

export default mergeConfig(base, defineConfig({ plugins: [swapModules()] }));
