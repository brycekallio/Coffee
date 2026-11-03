import { useRef, type KeyboardEvent } from "react";
import type { Page } from "@/types";

/** The two lists the toggle switches between. Routes stay `/` and `/watchlist`. */
const OPTIONS: { page: Extract<Page, "contacts" | "network_watchlist">; label: string }[] = [
  { page: "contacts", label: "Network" },
  { page: "network_watchlist", label: "Watchlist" },
];

/**
 * Network / Watchlist switch, shown beside the page title on both pages.
 *
 * A radio group (one stop in the tab order, arrow keys move and select), because it picks
 * one of two views. Active is a brighter neutral step, never cyan: cyan is for data.
 */
export default function NetworkToggle({
  page,
  onChange,
}: {
  page: "contacts" | "network_watchlist";
  onChange: (next: "contacts" | "network_watchlist") => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const at = OPTIONS.findIndex((o) => o.page === page);
    const next = (at + dir + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].page);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Switch between Network and Watchlist"
      onKeyDown={onKeyDown}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-input bg-white/[0.04] p-0.5"
    >
      {OPTIONS.map((o, i) => {
        const active = o.page === page;
        return (
          <button
            key={o.page}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => { if (!active) onChange(o.page); }}
            className={`cursor-pointer rounded-[0.6rem] px-3 py-1.5 text-[13px] font-medium transition duration-200 ${
              active ? "bg-white/[0.12] text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
