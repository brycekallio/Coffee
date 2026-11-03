import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { isDemoMode } from "@/demo/mode";
import { errorMessage } from "@/lib/utils";
import { createUndoQueue } from "./undoQueue";
import { nextStarValue, planTagChange, starredFirst, type BulkRow, type TagGroup } from "./tags";

export const UNDO_MS = 8000;

export interface BulkApi {
  remove(ids: string[]): Promise<void>;
  setStarred(ids: string[], starred: boolean): Promise<void>;
  setTags(group: TagGroup): Promise<void>;
}

export interface BulkListOptions<T extends BulkRow> {
  rows: T[];
  setRows: Dispatch<SetStateAction<T[]>>;
  reload: () => Promise<void>;
  api: BulkApi;
  noun: { one: string; many: string };
}

const count = (n: number, noun: { one: string; many: string }) => `${n} ${n === 1 ? noun.one : noun.many}`;

/**
 * The write side of bulk select for one list: delete (with Undo), star, tag.
 * Returns the rows to show: starred first, minus any waiting out their Undo window.
 *
 * In the public demo the database is read-only, so nothing is applied optimistically:
 * the write is sent, refused, and the app's usual demo toast explains why.
 */
export function useBulkList<T extends BulkRow>(opts: BulkListOptions<T>) {
  const { rows } = opts;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // The newest options, readable from callbacks that outlive a render (toasts, the Undo clock).
  const latestRef = useRef(opts);
  useEffect(() => {
    latestRef.current = opts;
  });

  const [queue] = useState(() =>
    createUndoQueue({
      delayMs: UNDO_MS,
      onHiddenChange: setHidden,
      commit: () => Promise.reject(new Error("not configured")),
      onCommitted: () => {},
      onFailed: () => {},
    }),
  );
  useEffect(() => {
    queue.configure({
      commit: (ids) => latestRef.current.api.remove(ids),
      onCommitted: (ids, batch) => {
        toast.dismiss(`undo-${batch}`);
        const gone = new Set(ids);
        latestRef.current.setRows((cur) => cur.filter((r) => !gone.has(r.id)));
      },
      onFailed: (ids, e, batch) => {
        toast.dismiss(`undo-${batch}`);
        toast.error(errorMessage(e, `Couldn't delete ${count(ids.length, latestRef.current.noun)}.`));
      },
    });
  }, [queue]);

  // Leaving the page inside the Undo window commits the delete rather than losing it.
  useEffect(() => () => void queue.flush(), [queue]);

  const shown = useMemo(() => starredFirst(rows.filter((r) => !hidden.has(r.id))), [rows, hidden]);

  // Stable functions that read the latest rows and api through `latest`, so a context value
  // built from them doesn't churn every render.
  const remove = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const { noun, api } = latestRef.current;
      if (isDemoMode) {
        api.remove(ids).catch((e) => toast.error(errorMessage(e, "Couldn't delete.")));
        return;
      }
      const batch = queue.enqueue(ids);
      toast(`${count(ids.length, noun)} deleted`, {
        id: `undo-${batch}`,
        duration: UNDO_MS,
        action: { label: "Undo", onClick: () => queue.undo(batch) },
      });
    },
    [queue],
  );

  const star = useCallback(async (ids: string[]) => {
    const { rows, setRows, api, reload } = latestRef.current;
    const picked = rows.filter((r) => ids.includes(r.id));
    if (picked.length === 0) return;
    const value = nextStarValue(picked);
    if (!isDemoMode) setRows((cur) => cur.map((r) => (ids.includes(r.id) ? { ...r, starred: value } : r)));
    try {
      await api.setStarred(picked.map((r) => r.id), value);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the star."));
      await reload();
    }
  }, []);

  const tag = useCallback(async (ids: string[], tagName: string, mode: "add" | "remove") => {
    const { rows, setRows, api, reload } = latestRef.current;
    const groups = planTagChange(rows.filter((r) => ids.includes(r.id)), tagName, mode);
    if (groups.length === 0) return;
    if (!isDemoMode) {
      const byId = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.tags] as const)));
      setRows((cur) => cur.map((r) => (byId.has(r.id) ? { ...r, tags: byId.get(r.id)! } : r)));
    }
    try {
      for (const g of groups) await api.setTags(g);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the tags."));
      await reload();
    }
  }, []);

  return { rows: shown, remove, star, tag };
}
