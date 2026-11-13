import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { followUpSlots, slotLabel, type FollowUpResult } from "./followUp";

const neutralBtn =
  "inline-flex min-h-10 items-center justify-center rounded-button bg-white/[0.08] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer";
const primaryBtn =
  "inline-flex min-h-10 items-center justify-center rounded-button bg-glow/90 px-4 py-1.5 text-xs font-semibold text-depth-0 transition hover:bg-glow disabled:opacity-50 cursor-pointer";

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

/** datetime-local value for a Date, in local time. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The "Schedule follow-up" button on an Outreach card and its slot picker. Pick a suggested slot
 * (or another date and time), then add it to Google Calendar, or "Just remind me" to keep the date
 * in Coffee. Not connected: "Connect Google Calendar" carries the pick through Google and back.
 */
export default function FollowUpPicker({
  name,
  connected,
  onSchedule,
  onConnect,
}: {
  name: string;
  connected: boolean;
  onSchedule: (mode: "calendar" | "reminder", start: Date) => Promise<FollowUpResult>;
  onConnect: (start: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const wide = useWide();
  const [busy, setBusy] = useState<"calendar" | "reminder" | null>(null);
  const [done, setDone] = useState<FollowUpResult | null>(null);
  // The server can say "reconnect" even when the profile says connected (an expired grant).
  const [mustReconnect, setMustReconnect] = useState(false);
  const needsConnect = !connected || mustReconnect;
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => (open ? followUpSlots(new Date()) : []), [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || dialogRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function run(mode: "calendar" | "reminder") {
    if (!start) return;
    setBusy(mode);
    const out = await onSchedule(mode, start);
    setBusy(null);
    if (out.kind === "needs_connect") setMustReconnect(true);
    else if (out.kind !== "error") setDone(out);
  }

  const isSel = (d: Date) => start?.getTime() === d.getTime();
  const isSuggested = start ? days.some((day) => day.slots.some(isSel)) : false;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setDone(null); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${neutralBtn} gap-1.5 whitespace-nowrap`}
      >
        <CalendarIcon />
        Schedule follow-up
      </button>

      {open ? floating(wide, (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={`Schedule follow-up with ${name}`}
          className={`z-50 rounded-section bg-depth-2 p-4 shadow-xl shadow-black/40 ${
            wide ? "absolute bottom-full left-0 mb-2 w-[23rem]" : "fixed inset-x-4 bottom-4"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Schedule follow-up</h3>
            <span className="truncate text-xs text-white/60">{name}</span>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label="Suggested times">
            {days.map((day) => (
              <div key={day.label} className="grid gap-1.5">
                <div className="text-center text-[11px] font-medium text-white/60">{day.label}</div>
                {day.slots.map((s) => (
                  <button
                    key={s.getTime()}
                    type="button"
                    aria-pressed={isSel(s)}
                    aria-label={slotLabel(s)}
                    onClick={() => { setStart(s); setDone(null); }}
                    className={`h-9 rounded-input font-data text-xs transition-colors cursor-pointer ${
                      isSel(s) ? "bg-glow font-semibold text-depth-0" : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white"
                    }`}
                  >
                    {s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "")}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
            <span className="shrink-0">Other time</span>
            <input
              type="datetime-local"
              name="followUpAt"
              value={start && !isSuggested ? toLocalInput(start) : ""}
              onChange={(e) => { const d = new Date(e.target.value); setStart(Number.isNaN(d.getTime()) ? null : d); setDone(null); }}
              className="min-w-0 flex-1 rounded-input [color-scheme:dark] border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 font-data text-xs text-white focus:border-glow/30 focus:outline-none focus:ring-2 focus:ring-glow/15"
            />
          </label>

          <div className="mt-4">
            {done ? (
              <p role="status" className="text-sm font-semibold text-glow">
                {done.kind === "scheduled" ? "Scheduled" : "Date saved"}: {slotLabel(done.kind === "scheduled" || done.kind === "reminded" ? done.start : start!)}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {needsConnect ? (
                    <button type="button" disabled={!start || busy !== null} onClick={() => start && onConnect(start)} className={primaryBtn}>
                      Connect Google Calendar
                    </button>
                  ) : (
                    <button type="button" disabled={!start || busy !== null} onClick={() => void run("calendar")} className={primaryBtn}>
                      {busy === "calendar" ? "Adding..." : "Add to Google Calendar"}
                    </button>
                  )}
                  <button type="button" disabled={!start || busy !== null} onClick={() => void run("reminder")} className={neutralBtn}>
                    {busy === "reminder" ? "Saving..." : "Just remind me"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-white/60">
                  {!start
                    ? "Pick a time."
                    : needsConnect
                    ? "Connect, and Coffee adds it to your calendar when you're back. Or keep the date in Coffee."
                    : `${slotLabel(start)}, 30 minutes.`}
                </p>
              </>
            )}
          </div>
        </div>
      )) : null}
    </div>
  );
}

const WIDE = "(min-width: 1024px)";

/** Two-column layout: the picker floats above its button. Narrower: a bottom sheet. */
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** The bottom sheet goes to <body>: a transformed ancestor would otherwise trap `position: fixed`. */
function floating(wide: boolean, node: ReactNode): ReactNode {
  return wide ? node : createPortal(node, document.body);
}
