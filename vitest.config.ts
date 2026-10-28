import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        // Edge Functions import supabase-js the Deno way. Under Node, point the jsr:
        // specifier at the npm build so the module resolves; tests mock it anyway.
        "jsr:@supabase/supabase-js@2": "@supabase/supabase-js",
      },
    },
    test: {
      include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
      environment: "node",
    },
  }),
);
