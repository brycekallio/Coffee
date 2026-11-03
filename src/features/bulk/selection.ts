// Selection logic for the bulk-select lists, kept pure so it can be tested without React.
// A selection is a Set of row ids; "order" is always the ids as currently shown (after
// search/filter), top to bottom.

export type Selection = ReadonlySet<string>;

export const EMPTY: Selection = new Set();

/** Flip one row. */
export function toggle(selected: Selection, id: string): Selection {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Shift-click: set every row between `anchor` and `target` (inclusive, either direction) to
 * `on`. With no usable anchor (never clicked, or it has since left the list) it acts on the
 * target alone, like a plain click.
 */
export function setRange(order: readonly string[], selected: Selection, anchor: string | null, target: string, on: boolean): Selection {
  const to = order.indexOf(target);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const next = new Set(selected);
  const lo = from === -1 ? to : Math.min(from, to);
  const hi = from === -1 ? to : Math.max(from, to);
  if (to === -1) return next;
  for (let i = lo; i <= hi; i++) {
    if (on) next.add(order[i]);
    else next.delete(order[i]);
  }
  return next;
}

export type AllState = "none" | "some" | "all";

export function allState(order: readonly string[], selected: Selection): AllState {
  if (order.length === 0) return "none";
  const n = order.filter((id) => selected.has(id)).length;
  return n === 0 ? "none" : n === order.length ? "all" : "some";
}

/** The header checkbox: select every shown row, or (when all are selected) clear them. */
export function toggleAll(order: readonly string[], selected: Selection): Selection {
  return allState(order, selected) === "all" ? EMPTY : new Set(order);
}

/**
 * Drops ids that are no longer shown (deleted, moved, or filtered out by search). A bulk
 * action must only ever touch rows the user can see, so the selection is pruned whenever the
 * visible list changes. Returns the same Set when nothing changed.
 */
export function prune(selected: Selection, order: readonly string[]): Selection {
  if (selected.size === 0) return selected;
  const visible = new Set(order);
  const kept = [...selected].filter((id) => visible.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
}

/**
 * One click on a row's checkbox. A plain click flips that row; with Shift it sets the whole
 * range from the last row clicked (`anchor`) to the state the clicked row is moving to.
 * Pure: the caller records `id` as the new anchor.
 */
export function applyClick(order: readonly string[], selected: Selection, anchor: string | null, id: string, shift: boolean): Selection {
  return shift ? setRange(order, selected, anchor, id, !selected.has(id)) : toggle(selected, id);
}
