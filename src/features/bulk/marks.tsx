/** The "important" mark shown beside a starred row: white, not the accent (cyan is for data). */
export function StarMark() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" role="img" aria-label="Starred" className="shrink-0 text-white/90">
      <title>Starred</title>
      <path d="M10 1.6l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.6 4.8 17.5 6 11.7 1.6 7.7l5.9-.7L10 1.6z" />
    </svg>
  );
}

/** A row's tags as small neutral chips. */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="max-w-[10rem] truncate rounded-badge bg-white/[0.08] px-1.5 py-0.5 text-[11px] leading-4 text-white/80">
          {t}
        </span>
      ))}
    </div>
  );
}
