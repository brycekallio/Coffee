import TagMenu from "./TagMenu";

interface BulkBarProps {
  count: number;
  /** True when every selected row is starred, so the button offers "Unstar". */
  allStarred: boolean;
  knownTags: string[];
  selectedRows: { tags: string[] }[];
  moveLabel: string;
  onStar: () => void;
  onTag: (tag: string, mode: "add" | "remove") => void;
  onMove: () => void;
  onDelete: () => void;
  onClear: () => void;
  busy?: boolean;
}

const btn =
  "rounded-button bg-white/[0.08] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer";
// Destructive stays grey until hover; red is a signal, not a resting colour.
const btnDanger =
  "rounded-button bg-white/[0.08] px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-50 cursor-pointer";

/** Replaces the column labels in the list header while rows are selected (Gmail's pattern). */
export default function BulkBar(p: BulkBarProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="toolbar" aria-label="Actions for selected rows">
      <span className="mr-1 font-data text-sm font-medium text-white">{p.count} selected</span>
      <button onClick={p.onStar} disabled={p.busy} className={btn}>
        {p.allStarred ? "Unstar" : "Star"}
      </button>
      <TagMenu known={p.knownTags} selectedRows={p.selectedRows} onChange={p.onTag} buttonCls={btn} />
      <button onClick={p.onMove} disabled={p.busy} className={btn}>
        {p.moveLabel}
      </button>
      <button onClick={p.onDelete} disabled={p.busy} className={btnDanger}>
        Delete
      </button>
      <button onClick={p.onClear} className="ml-auto text-sm text-white/60 transition-colors hover:text-white hover:underline cursor-pointer">
        Clear
      </button>
    </div>
  );
}
