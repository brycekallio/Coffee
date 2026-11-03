// Delete-with-undo, without ever deleting something that can't be brought back.
//
// "Delete" hides the rows at once and only really deletes them after `delayMs` (the Undo
// window). Undo inside the window just un-hides them: nothing was sent, so everything
// attached to a contact (meetings, application links, which cascade or null out on a real
// delete) comes back intact. Re-inserting after a real delete could never restore those.
//
// Closing the tab inside the window leaves the rows undeleted. That is the safe direction.

export interface UndoQueueOptions {
  delayMs: number;
  /** Really delete. Called once per batch, after the window or on flush. */
  commit: (ids: string[]) => Promise<void>;
  /** The set of currently hidden ids changed. */
  onHiddenChange: (hidden: ReadonlySet<string>) => void;
  onCommitted: (ids: string[], batch: number) => void;
  onFailed: (ids: string[], error: unknown, batch: number) => void;
}

export interface UndoQueue {
  /** Swap the callbacks (a React hook keeps them pointing at the newest render). */
  configure(next: Partial<UndoQueueOptions>): void;
  /** Hide `ids` and start the clock. Returns a batch id for `undo`. */
  enqueue(ids: string[]): number;
  /** Cancel a batch inside its window. False once the delete has been sent, or if it never existed. */
  undo(batch: number): boolean;
  /** Commit every waiting batch now (the page is going away). */
  flush(): Promise<void>;
  hidden(): ReadonlySet<string>;
}

export function createUndoQueue(initial: UndoQueueOptions): UndoQueue {
  let opts = initial;
  const batches = new Map<number, { ids: string[]; timer: ReturnType<typeof setTimeout>; sent: boolean }>();
  let counter = 0;

  const hidden = () => new Set([...batches.values()].flatMap((b) => b.ids));
  const publish = () => opts.onHiddenChange(hidden());

  async function commitBatch(batch: number) {
    const b = batches.get(batch);
    if (!b || b.sent) return;
    clearTimeout(b.timer);
    b.sent = true; // too late to undo from here on
    // Still hidden while the request is in flight; unhidden only once it has resolved.
    try {
      await opts.commit(b.ids);
      batches.delete(batch);
      opts.onCommitted(b.ids, batch);
    } catch (e) {
      batches.delete(batch);
      opts.onFailed(b.ids, e, batch);
    }
    publish();
  }

  return {
    configure(next) {
      opts = { ...opts, ...next };
    },
    enqueue(ids) {
      const batch = ++counter;
      batches.set(batch, { ids, timer: setTimeout(() => void commitBatch(batch), opts.delayMs), sent: false });
      publish();
      return batch;
    },
    undo(batch) {
      const b = batches.get(batch);
      if (!b || b.sent) return false;
      clearTimeout(b.timer);
      batches.delete(batch);
      publish();
      return true;
    },
    async flush() {
      await Promise.all([...batches.keys()].map(commitBatch));
    },
    hidden,
  };
}
