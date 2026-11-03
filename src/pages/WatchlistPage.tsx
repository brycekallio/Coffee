import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { currentUserId } from "../lib/appSession";
import type { WatchlistTarget } from "../types";
import Card from "../components/ui/Card";
import { inputCls, selectCls } from "@/components/ui/styles";
import { toast } from "sonner";
import { useSession } from "@/app/session";
import { useContacts } from "@/features/contacts/contactsContext";
import BulkBar from "@/features/bulk/BulkBar";
import Checkbox from "@/features/bulk/Checkbox";
import { StarMark, TagChips } from "@/features/bulk/marks";
import { moveTargetsToContacts } from "@/features/bulk/moveApi";
import { allTags, hasTag, nextStarValue } from "@/features/bulk/tags";
import { useBulkList } from "@/features/bulk/useBulkList";
import { useSelection } from "@/features/bulk/useSelection";
import * as watchlistApi from "@/features/watchlist/api";
import { errorMessage } from "@/lib/utils";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_contacted", label: "Not Contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "follow_up_sent", label: "Follow-up Sent" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_STYLE: Record<string, string> = {
  not_contacted: "bg-white/[0.04] text-white/40",
  contacted: "bg-glow/[0.06] text-glow/60",
  scheduled: "bg-glow/[0.08] text-glow/70",
  completed: "bg-glow/[0.12] text-glow",
  follow_up_sent: "bg-glow/[0.06] text-glow/60",
};

export default function WatchlistPage() {
  /* ── state ─────────────────────────────────────────────── */
  const user = useSession();
  const { reload: reloadContacts } = useContacts();
  const [rawTargets, setTargets] = useState<WatchlistTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const [personName, setPersonName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("not_contacted");
  const [nextActionDate, setNextActionDate] = useState("");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* ── helpers ────────────────────────────────────────────── */
  const resetForm = () => {
    setPersonName("");
    setCompany("");
    setRole("");
    setStatus("not_contacted");
    setNextActionDate("");
    setNotes("");
    setEditingId(null);
  };

  /* ── CRUD ──────────────────────────────────────────────── */
  // Query and apply are split so the mount effect can hand applyTargets to .then() —
  // setState only from a callback. `loading` starts true, so mount skips setLoading(true).
  const queryTargets = () =>
    supabase.from("watchlist_targets").select("*").order("created_at", { ascending: false });

  const applyTargets = useCallback(
    ({ data, error }: Awaited<ReturnType<typeof queryTargets>>) => {
      if (error) {
        toast.error("Failed to load watchlist: " + error.message);
      } else {
        setTargets(data);
      }
      setLoading(false);
    },
    []
  );

  const loadTargets = async () => {
    setLoading(true);
    applyTargets(await queryTargets());
  };

  // Bulk select: delete (with Undo), star, tag, move to the Network.
  const bulkList = useBulkList({
    rows: rawTargets,
    setRows: setTargets,
    reload: loadTargets,
    noun: { one: "person", many: "people" },
    api: {
      remove: (ids) => watchlistApi.deleteTargets(user.id, ids),
      setStarred: (ids, starred) => watchlistApi.setTargetsStarred(user.id, ids, starred),
      setTags: (group) => watchlistApi.setTargetsTags(user.id, group),
    },
  });
  const allTargets = bulkList.rows; // starred first, minus any waiting out their Undo window
  const [tagFilter, setTagFilter] = useState("");
  const knownTags = useMemo(() => allTags(allTargets), [allTargets]);
  const activeTag = knownTags.some((t) => t === tagFilter) ? tagFilter : "";
  const targets = useMemo(
    () => (activeTag ? allTargets.filter((t) => hasTag(t.tags, activeTag)) : allTargets),
    [allTargets, activeTag],
  );
  const order = useMemo(() => targets.map((t) => t.id), [targets]);
  const sel = useSelection(order);
  const selectedRows = targets.filter((t) => sel.selected.has(t.id));
  const [moving, setMoving] = useState(false);

  const moveSelected = async () => {
    setMoving(true);
    try {
      const { moved } = await moveTargetsToContacts(user.id, sel.ids);
      if (moved > 0) toast.success(`Moved ${moved} ${moved === 1 ? "person" : "people"} to your Network.`);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't move them."));
    } finally {
      await Promise.all([loadTargets(), reloadContacts()]);
      setMoving(false);
    }
  };

  const addTarget = async () => {
    if (!personName.trim() || !company.trim()) {
      toast.error("Person name and company are required.");
      return;
    }

    setSaving(true);
    const userId = await currentUserId();

    if (!userId) {
      toast.error("You must be signed in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("watchlist_targets").insert({
      owner_id: userId,
      person_name: personName.trim(),
      company: company.trim(),
      role: role.trim() || null,
      status,
      next_action_date: nextActionDate || null,
      notes: notes.trim() || null,
    });

    if (error) {
      toast.error("Failed to add target: " + error.message);
    } else {
      toast.success("Target added!");
      resetForm();
      await loadTargets();
    }
    setSaving(false);
  };

  const updateTarget = async () => {
    if (!editingId) return;
    if (!personName.trim() || !company.trim()) {
      toast.error("Person name and company are required.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("watchlist_targets")
      .update({
        person_name: personName.trim(),
        company: company.trim(),
        role: role.trim() || null,
        status,
        next_action_date: nextActionDate || null,
        notes: notes.trim() || null,
      })
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to update target: " + error.message);
    } else {
      toast.success("Target updated!");
      resetForm();
      await loadTargets();
    }
    setSaving(false);
  };

  const deleteTarget = async (id: string) => {
    if (!window.confirm("Delete this watchlist target?")) return;

    const { error } = await supabase
      .from("watchlist_targets")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete target: " + error.message);
    } else {
      toast.success("Target deleted.");
      if (editingId === id) resetForm();
      await loadTargets();
    }
  };

  const startEdit = (t: WatchlistTarget) => {
    setEditingId(t.id);
    setPersonName(t.person_name);
    setCompany(t.company);
    setRole(t.role ?? "");
    setStatus(t.status);
    setNextActionDate(t.next_action_date ?? "");
    setNotes(t.notes ?? "");
  };

  const cancelEdit = () => resetForm();

  /* ── load on mount ─────────────────────────────────────── */
  useEffect(() => {
    queryTargets().then(applyTargets);
  }, [applyTargets]);

  /* ── render ────────────────────────────────────────────── */
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-10 md:px-6 lg:grid-cols-3">
      {/* Form — 1/3 */}
      <div className="lg:col-span-1">
        <Card
          title={editingId ? "Edit Target" : "Add Target"}
          subtitle="Track people you want to network with."
        >
          <div className="grid gap-3">
            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Person Name</div>
              <input
                className={inputCls}
                placeholder="e.g. Jane Smith"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Company</div>
              <input
                className={inputCls}
                placeholder="e.g. Evercore"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Role / Title (optional)</div>
              <input
                className={inputCls}
                placeholder="e.g. Engineering Manager"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-white/35">Status</div>
                <select
                  className={selectCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-white/35">Next Action Date</div>
                <input
                  className={inputCls}
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Notes (optional)</div>
              <textarea
                className={inputCls + " min-h-[72px] resize-y"}
                placeholder="Any context, talking points, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={editingId ? updateTarget : addTarget}
                disabled={saving}
                className="w-full rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition duration-300 hover:bg-glow active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Add Target"}
              </button>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* List — 2/3 */}
      <div className="lg:col-span-2">
        <Card
          title="Watchlist"
          subtitle={loading ? "Loading..." : `${allTargets.length} target${allTargets.length !== 1 ? "s" : ""}`}
          right={
            <div className="flex items-center gap-2">
              {knownTags.length > 0 ? (
                <select
                  className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 outline-none"
                  aria-label="Filter by tag"
                  value={activeTag}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">All tags</option>
                  {knownTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                onClick={loadTargets}
                className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                Refresh
              </button>
            </div>
          }
        >
          <div className="mt-2 rounded-section bg-depth-0/40">
            <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2">
              <Checkbox state={sel.all} label="Select all people" onToggle={() => sel.onToggleAll()} />
              {sel.count > 0 ? (
                <BulkBar
                  count={sel.count}
                  allStarred={!nextStarValue(selectedRows)}
                  knownTags={knownTags}
                  selectedRows={selectedRows}
                  moveLabel="Move to Network"
                  busy={moving}
                  onStar={() => void bulkList.star(sel.ids)}
                  onTag={(tag, mode) => void bulkList.tag(sel.ids, tag, mode)}
                  onMove={() => void moveSelected()}
                  onDelete={() => bulkList.remove(sel.ids)}
                  onClear={sel.clear}
                />
              ) : (
                <>
                  <span className="text-xs text-white/60 md:hidden">Select all</span>
                  <div className="hidden min-w-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-3 text-xs font-medium text-white/60 md:grid">
                    <div>Name</div>
                    <div>Company</div>
                    <div>Role</div>
                    <div>Status</div>
                    <div>Next Action</div>
                    <div>Actions</div>
                  </div>
                </>
              )}
            </div>
            <div className="h-px w-full bg-white/[0.04]" />

            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-white/40">Loading watchlist...</div>
            ) : targets.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-white/50">No one on your radar yet.</p>
                <p className="mt-1 text-xs text-white/25">
                  Opportunity doesn't knock. It networks.
                </p>
              </div>
            ) : (
              targets.map((t) => (
                <div key={t.id}>
                  <div className={`flex items-center gap-3 px-4 transition-colors hover:bg-white/[0.02] ${sel.selected.has(t.id) ? "bg-white/[0.05]" : ""}`}>
                  <Checkbox state={sel.selected.has(t.id) ? "all" : "none"} label={`Select ${t.person_name}`} onToggle={(shift) => sel.onToggle(t.id, shift)} />
                  <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-white" title={t.person_name}>
                          {t.person_name}
                        </span>
                        {t.starred ? <StarMark /> : null}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-white/60 md:hidden">
                        {[t.company, t.role].filter(Boolean).join(" \u00b7 ") || "\u2014"}
                      </div>
                      <TagChips tags={t.tags} />
                    </div>
                    <div className="hidden truncate text-sm text-white/50 md:block" title={t.company}>
                      {t.company || "\u2014"}
                    </div>
                    <div className="hidden truncate text-sm text-white/50 md:block" title={t.role ?? ""}>
                      {t.role ?? "\u2014"}
                    </div>
                    <div className="row-span-2 text-sm md:row-span-1">
                      <span
                        className={`inline-block rounded-badge px-2 py-1 text-xs font-medium ${STATUS_STYLE[t.status] ?? "bg-white/[0.04] text-white/40"}`}
                      >
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-4 md:contents">
                      <div className="font-data text-sm text-white/60 md:text-white/40">
                        {t.next_action_date ? <><span className="md:hidden">Next: </span>{t.next_action_date}</> : "\u2014"}
                      </div>
                      <div className="flex gap-3 md:gap-2">
                        <button
                          onClick={() => startEdit(t)}
                          className="text-xs font-medium text-white/60 transition-colors hover:text-white cursor-pointer md:text-white/35"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteTarget(t.id)}
                          className="text-xs font-medium text-danger/70 transition-colors hover:text-danger cursor-pointer md:text-danger/50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  </div>
                  <div className="h-px w-full bg-white/[0.03]" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
