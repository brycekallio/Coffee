import { useEffect, useState } from "react";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import {
  type AiProvider,
  type AiStatus,
  fetchAiStatus,
  PROVIDER_INFO,
  POWER_TOOLS,
  prettyModel,
  removeAiKey,
  saveAiKey,
  SUGGESTED_MODELS,
  testAiKey,
} from "./client";

interface Props {
  inputCls: string;
  selectCls: string;
  /** Lets the parent page react when the tier changes (e.g. enable the rewrite toggle). */
  onTierChange?: (status: AiStatus) => void;
}

export default function AiEngineSettings({
  inputCls,
  selectCls,
  onTierChange,
}: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const [provider, setProvider] = useState<AiProvider>("openrouter");
  const [model, setModel] = useState(SUGGESTED_MODELS.openrouter[0].id);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);

  function applyStatus(next: AiStatus) {
    setStatus(next);
    onTierChange?.(next);
    if (next.settings) {
      setProvider(next.settings.provider);
      setModel(next.settings.model);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchAiStatus();
        if (!cancelled) applyStatus(next);
      } catch (e) {
        // A failure here is not fatal — the free tier still works. Say so quietly.
        if (!cancelled) {
          console.warn("Could not load AI engine status:", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchProvider(next: AiProvider) {
    setProvider(next);
    setModel(SUGGESTED_MODELS[next][0].id);
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      toast.error("Paste an API key first.");
      return;
    }
    setBusy("test");
    try {
      const result = await testAiKey(provider, model.trim(), apiKey.trim());
      toast.success(`Key works — ${result.model} responded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      toast.error("Paste an API key first.");
      return;
    }
    setBusy("save");
    try {
      const next = await saveAiKey(provider, model.trim(), apiKey.trim());
      applyStatus(next);
      setApiKey("");
      setExpanded(false);
      toast.success("Power tools unlocked. Your key is stored server-side.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy("remove");
    try {
      const next = await removeAiKey();
      applyStatus(next);
      toast.info("Key removed. You're back on the free engine.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the key.");
    } finally {
      setBusy(null);
    }
  }

  const tier = status?.tier ?? "free";
  const isPower = tier === "power";
  const info = PROVIDER_INFO[provider];

  return (
    <Card
      title="AI engine"
      subtitle="Which model powers Coffee's AI features — and how to unlock the rest."
    >
      <div className="grid gap-4">
        {/* ── current engine ─────────────────────────────────────────── */}
        <div className="rounded-input bg-depth-0/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    loading
                      ? "bg-white/20"
                      : isPower
                      ? "bg-glow shadow-[0_0_8px_rgba(0,229,255,0.6)]"
                      : "bg-glow/40"
                  }`}
                />
                <span className="text-sm font-medium text-white">
                  {loading
                    ? "Checking engine…"
                    : isPower
                    ? `Power tier · ${PROVIDER_INFO[status!.settings!.provider].label}`
                    : "Free tier · open-weight model"}
                </span>
              </div>
              <div className="mt-1 font-data text-xs text-white/40">
                {loading
                  ? "—"
                  : isPower
                  ? `${status!.settings!.model}  ·  key ${status!.settings!.key_hint ?? "saved"}`
                  : `${status?.free_model ?? "nemotron-3-super"}  ·  no key needed`}
              </div>
            </div>

            {isPower ? (
              <button
                onClick={handleRemove}
                disabled={busy !== null}
                className="rounded-button bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-50 cursor-pointer"
              >
                {busy === "remove" ? "Removing…" : "Remove key"}
              </button>
            ) : (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded-button bg-glow/90 px-4 py-2 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow cursor-pointer"
              >
                {expanded ? "Never mind" : "Use my own key"}
              </button>
            )}
          </div>

          {!isPower && !loading && (
            <p className="mt-3 text-xs leading-relaxed text-white/30">
              The free engine runs a free open-weight model on a shared key — no setup, but
              it's rate-limited (20 requests/minute, 50/day across everyone) and three tools
              stay locked.
            </p>
          )}
        </div>

        {/* ── power tools ────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
            {isPower ? "Unlocked" : "Unlocks with your own key"}
          </div>
          <div className="grid gap-2">
            {POWER_TOOLS.map((tool) => (
              <div
                key={tool.id}
                className={`flex gap-3 rounded-input p-3 ${
                  isPower ? "bg-glow/[0.04]" : "bg-white/[0.02]"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 text-xs ${
                    isPower ? "text-glow" : "text-white/20"
                  }`}
                >
                  {isPower ? "✓" : "○"}
                </span>
                <div>
                  <div
                    className={`text-sm font-medium ${
                      isPower ? "text-white" : "text-white/50"
                    }`}
                  >
                    {tool.name}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-white/30">
                    {tool.blurb}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── key form ───────────────────────────────────────────────── */}
        {(expanded || isPower) && (
          <div className="grid gap-3 rounded-input bg-depth-0/30 p-4">
            <div className="text-sm font-medium text-white">
              {isPower ? "Change engine" : "Connect a provider"}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/40">
                  Provider
                </label>
                <select
                  className={selectCls}
                  value={provider}
                  onChange={(e) => switchProvider(e.target.value as AiProvider)}
                >
                  {(Object.keys(PROVIDER_INFO) as AiProvider[]).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_INFO[p].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-white/40">
                  Model
                </label>
                <select
                  className={selectCls}
                  value={
                    SUGGESTED_MODELS[provider].some((m) => m.id === model)
                      ? model
                      : "__custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "__custom") setModel(e.target.value);
                  }}
                >
                  {SUGGESTED_MODELS[provider].map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="__custom">Custom…</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">
                Model ID
              </label>
              <input
                className={`${inputCls} font-data`}
                value={model}
                placeholder={info.placeholder}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/40">
                API key
              </label>
              <input
                className={`${inputCls} font-data`}
                type="password"
                autoComplete="off"
                placeholder={`${info.keyPrefix}…`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-white/30">
                {info.hint}{" "}
                <a
                  href={info.keyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-glow/70 underline decoration-glow/30 hover:text-glow"
                >
                  Get a key →
                </a>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/25">
                Stored server-side and never sent back to the browser — Coffee only ever
                shows you the last four characters.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={handleTest}
                disabled={busy !== null || !apiKey.trim()}
                className="rounded-button bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] disabled:opacity-50 cursor-pointer"
              >
                {busy === "test" ? "Testing…" : "Test key"}
              </button>
              <button
                onClick={handleSave}
                disabled={busy !== null || !apiKey.trim()}
                className="rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all hover:bg-glow disabled:opacity-50 cursor-pointer"
              >
                {busy === "save"
                  ? "Verifying…"
                  : isPower
                  ? `Switch to ${prettyModel(model)}`
                  : "Save & unlock"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
