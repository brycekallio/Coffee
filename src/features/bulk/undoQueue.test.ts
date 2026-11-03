import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUndoQueue } from "./undoQueue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(commit: (ids: string[]) => Promise<void> = async () => {}) {
  const log = { committed: [] as string[][], failed: [] as string[][], hidden: new Set<string>() };
  const queue = createUndoQueue({
    delayMs: 8000,
    commit: vi.fn(commit),
    onHiddenChange: (h) => (log.hidden = new Set(h)),
    onCommitted: (ids) => log.committed.push(ids),
    onFailed: (ids) => log.failed.push(ids),
  });
  return { queue, log };
}

describe("undo queue (delete with Undo)", () => {
  it("hides rows at once but does not delete anything inside the window", async () => {
    const commit = vi.fn(async () => {});
    const { queue, log } = setup(commit);
    queue.enqueue(["a", "b"]);
    expect([...log.hidden].sort()).toEqual(["a", "b"]);
    await vi.advanceTimersByTimeAsync(7999);
    expect(commit).not.toHaveBeenCalled();
  });

  it("undo inside the window un-hides the rows and the delete never happens", async () => {
    const commit = vi.fn(async () => {});
    const { queue, log } = setup(commit);
    const batch = queue.enqueue(["a"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(queue.undo(batch)).toBe(true);
    expect(log.hidden.size).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(log.committed).toEqual([]);
  });

  it("commits once the window ends, then it is too late to undo", async () => {
    const commit = vi.fn(async () => {});
    const { queue, log } = setup(commit);
    const batch = queue.enqueue(["a", "b"]);
    await vi.advanceTimersByTimeAsync(8000);
    expect(commit).toHaveBeenCalledWith(["a", "b"]);
    expect(log.committed).toEqual([["a", "b"]]);
    expect(log.hidden.size).toBe(0);
    expect(queue.undo(batch)).toBe(false);
  });

  it("undo is refused once the delete request is in flight", async () => {
    let finish!: () => void;
    const { queue, log } = setup(() => new Promise<void>((r) => (finish = r)));
    const batch = queue.enqueue(["a"]);
    await vi.advanceTimersByTimeAsync(8000); // request sent, not answered
    expect(queue.undo(batch)).toBe(false);
    expect(log.hidden.has("a")).toBe(true); // still hidden while we wait
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.committed).toEqual([["a"]]);
  });

  it("a failed delete reports the failure and brings the rows back", async () => {
    const { queue, log } = setup(async () => {
      throw new Error("nope");
    });
    queue.enqueue(["a"]);
    await vi.advanceTimersByTimeAsync(8000);
    expect(log.failed).toEqual([["a"]]);
    expect(log.committed).toEqual([]);
    expect(log.hidden.size).toBe(0);
  });

  it("batches are independent: undoing one leaves the other to commit", async () => {
    const commit = vi.fn(async () => {});
    const { queue } = setup(commit);
    const first = queue.enqueue(["a"]);
    await vi.advanceTimersByTimeAsync(3000);
    queue.enqueue(["b"]);
    queue.undo(first);
    await vi.advanceTimersByTimeAsync(8000);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(["b"]);
  });

  it("flush (leaving the page) commits everything waiting right away", async () => {
    const commit = vi.fn(async () => {});
    const { queue, log } = setup(commit);
    queue.enqueue(["a"]);
    queue.enqueue(["b"]);
    await queue.flush();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(log.committed).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commit).toHaveBeenCalledTimes(2); // timers were cleared, nothing runs twice
  });
});
