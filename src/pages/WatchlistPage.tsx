import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { currentUserId } from "../lib/appSession";
import type { WatchlistTarget } from "../types";
import Card from "../components/ui/Card";
import { toast } from "sonner";

interface WatchlistPageProps {
  inputCls: string;
  selectCls: string;
}

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

export default function WatchlistPage({ inputCls, selectCls }: WatchlistPageProps) {
  /* ── state ─────────────────────────────────────────────── */
  const [targets, setTargets] = useState<WatchlistTarget[]>([]);
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
  const loadTargets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("watchlist_targets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load watchlist: " + error.message);
    } else {
      setTargets(data as WatchlistTarget[]);
    }
    setLoading(false);
  }, []);

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
    loadTargets();
  }, [loadTargets]);

  /* ── render ────────────────────────────────────────────── */
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-3">
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
                placeholder="e.g. Acme Corp"
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
                className="w-full rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 shadow-[0_0_24px_rgba(0,229,255,0.2)] transition-all duration-300 hover:bg-glow active:scale-[0.98] disabled:opacity-50 cursor-pointer"
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
          subtitle={loading ? "Loading..." : `${targets.length} target${targets.length !== 1 ? "s" : ""}`}
          right={
            <button
              onClick={loadTargets}
              className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
            >
              Refresh
            </button>
          }
        >
          <div className="mt-2 rounded-section bg-depth-0/40">
            <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_0.8fr] items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-white/30 font-medium">
              <div>Name</div>
              <div>Company</div>
              <div>Role</div>
              <div>Status</div>
              <div>Next Action</div>
              <div>Actions</div>
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
                  <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_0.8fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                    <div className="truncate font-medium text-white" title={t.person_name}>
                      {t.person_name}
                    </div>
                    <div className="truncate text-sm text-white/50" title={t.company}>
                      {t.company}
                    </div>
                    <div className="truncate text-sm text-white/50" title={t.role ?? ""}>
                      {t.role ?? "\u2014"}
                    </div>
                    <div className="text-sm">
                      <span
                        className={`inline-block rounded-badge px-2 py-1 text-xs font-medium ${STATUS_STYLE[t.status] ?? "bg-white/[0.04] text-white/40"}`}
                      >
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <div className="font-data text-sm text-white/40">
                      {t.next_action_date ?? "\u2014"}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs font-medium text-white/35 transition-colors hover:text-white cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTarget(t.id)}
                        className="text-xs font-medium text-danger/50 transition-colors hover:text-danger cursor-pointer"
                      >
                        Delete
                      </button>
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
