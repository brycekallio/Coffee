import { useEffect, useRef, useState } from "react";
import { inputCls } from "@/components/ui/styles";
import { MAX_TAG_LENGTH, normalizeTag, tagState } from "./tags";

interface TagMenuProps {
  /** Every tag in use on this list. */
  known: string[];
  /** The selected rows, to show which tags they already carry. */
  selectedRows: { tags: string[] }[];
  onChange: (tag: string, mode: "add" | "remove") => void;
  buttonCls: string;
  disabled?: boolean;
}

/** "Tag" button + popover: tick a tag to add it to the selection, untick to remove it, or make a new one. */
export default function TagMenu({ known, selectedRows, onChange, buttonCls, disabled }: TagMenuProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function addDraft() {
    const tag = normalizeTag(draft);
    if (!tag) return;
    onChange(tag, "add");
    setDraft("");
  }

  // A tag typed here that nobody has yet still shows up (as ticked) once it's applied.
  return (
    <div ref={root} className="relative">
      <button onClick={() => setOpen((o) => !o)} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className={buttonCls}>
        Tag
      </button>
      {open ? (
        <div role="dialog" aria-label="Tag selected" className="absolute left-0 top-full z-30 mt-2 w-64 rounded-section bg-depth-2 p-3 shadow-xl shadow-black/40">
          <input name="draft"
            className={inputCls}
            placeholder="New tag, then Enter"
            maxLength={MAX_TAG_LENGTH}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDraft()}
          />
          {known.length > 0 ? (
            <ul className="mt-2 max-h-48 overflow-y-auto">
              {known.map((tag) => {
                const state = tagState(selectedRows, tag);
                return (
                  <li key={tag}>
                    <button
                      role="menuitemcheckbox"
                      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
                      onClick={() => onChange(tag, state === "all" ? "remove" : "add")}
                      className="flex w-full items-center gap-3 rounded-input px-2 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
                    >
                      <span className="bulk-check" data-state={state} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{tag}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 px-1 text-sm text-white/60">No tags yet. Type one above to start a group.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
