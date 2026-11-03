import { useCallback, useRef, useState } from "react";
import { EMPTY, allState, applyClick, prune, toggleAll, type Selection } from "./selection";

/**
 * Checkbox selection over the rows currently shown (`order`, top to bottom).
 * Shift-click selects the range from the last row you clicked.
 */
export function useSelection(order: readonly string[]) {
  const [selected, setSelected] = useState<Selection>(EMPTY);
  const anchor = useRef<string | null>(null);

  // Rows that leave the list (deleted, moved, filtered out) leave the selection too, so a
  // bulk action never touches something you can't see. Adjusting state during render.
  const pruned = prune(selected, order);
  if (pruned !== selected) setSelected(pruned);

  const onToggle = useCallback(
    (id: string, shift: boolean) => {
      // Read the anchor now: it moves to this row straight after, before any updater would run.
      setSelected(applyClick(order, pruned, anchor.current, id, shift));
      anchor.current = id;
    },
    [order, pruned],
  );

  return {
    selected: pruned,
    ids: [...pruned],
    count: pruned.size,
    all: allState(order, pruned),
    onToggle,
    onToggleAll: useCallback(() => setSelected((cur) => toggleAll(order, cur)), [order]),
    clear: useCallback(() => setSelected(EMPTY), []),
  };
}
