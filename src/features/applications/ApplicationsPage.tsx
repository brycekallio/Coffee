import { useState } from "react";
import { toast } from "sonner";
import Card from "@/components/ui/Card";
import { inputCls, selectCls } from "@/components/ui/styles";
import { useSession } from "@/app/session";
import { errorMessage, todayISODate } from "@/lib/utils";
import type { Application } from "@/types";
import { useContacts } from "@/features/contacts/contactsContext";
import * as api from "./api";
import { useApplications } from "./useApplications";

const STATUS_STYLE: Record<string, string> = {
  Applied: "bg-white/[0.04] text-white/50",
  Interviewing: "bg-glow/[0.08] text-glow/80",
  Accepted: "bg-glow/[0.12] text-glow",
  Rejected: "bg-danger/[0.08] text-danger/70",
};

export default function ApplicationsPage() {
  const { contacts } = useContacts();
  const user = useSession();
  const { applications, loading: loadingApps, reload: loadApplications } = useApplications();

  // Form draft — only this page reads it, so it lives here rather than in App.
  const [appCompany, setAppCompany] = useState("");
  const [appLink, setAppLink] = useState("");
  const [appDate, setAppDate] = useState(todayISODate());
  const [appStatus, setAppStatus] = useState("Applied");
  const [appContactId, setAppContactId] = useState("");
  const [savingApp, setSavingApp] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [updatingStatusId, setUpdatingStatusId] = useState<string>("");

  const KANBAN_COLUMNS = ["Bookmarked", "Applied", "Interview", "Offer", "Rejected"];

  function resetForm() {
    setEditingAppId(null);
    setAppCompany("");
    setAppLink("");
    setAppDate(todayISODate());
    setAppStatus("Applied");
    setAppContactId("");
  }

  async function saveApplication() {
    if (!appCompany.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setSavingApp(true);
    try {
      const values = {
        owner_id: user.id,
        company: appCompany.trim(),
        link: appLink.trim() || null,
        date_applied: appDate || null,
        status: appStatus.trim() || "Applied",
        contact_id: appContactId || null,
      };
      if (editingAppId) await api.updateApplication(editingAppId, values);
      else await api.createApplication(values);

      resetForm();
      await loadApplications();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to save application."));
    } finally {
      setSavingApp(false);
    }
  }

  async function deleteApplication(id: string) {
    if (!confirm("Delete this application?")) return;
    try {
      await api.deleteApplication(id);
      await loadApplications();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to delete application."));
    }
  }

  function startEditApp(a: Application) {
    setEditingAppId(a.id);
    setAppCompany(a.company);
    setAppLink(a.link ?? "");
    setAppDate(a.date_applied ?? "");
    setAppStatus(a.status);
    setAppContactId(a.contact_id ?? "");
  }

  const cancelEditApp = resetForm;

  async function updateApplicationStatus(appId: string, newStatus: string) {
    setUpdatingStatusId(appId);
    try {
      await api.updateApplication(appId, { status: newStatus });
      toast.success("Application updated.");
      await loadApplications();
    } catch (e) {
      toast.error(errorMessage(e, "Failed to update application."));
    } finally {
      setUpdatingStatusId("");
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 md:px-6 lg:grid-cols-3">
      {/* Form — 1/3 */}
      <div className="lg:col-span-1">
        <Card title={editingAppId ? "Edit Application" : "Track Application"} subtitle="Keep tabs on where you've applied.">
          <div className="grid gap-3">
            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Company Name</div>
              <input className={inputCls} placeholder="e.g. FTI Consulting" value={appCompany} onChange={(e) => setAppCompany(e.target.value)} />
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Application Link (optional)</div>
              <input className={inputCls} placeholder="https://..." value={appLink} onChange={(e) => setAppLink(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-white/35">Date Applied</div>
                <input className={inputCls} type="date" value={appDate} onChange={(e) => setAppDate(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-white/35">Status</div>
                <select
                  className={selectCls}
                  value={appStatus}
                  onChange={(e) => setAppStatus(e.target.value)}
                >
                  <option value="Applied">Applied</option>
                  <option value="Interviewing">Interviewing</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-white/35">Linked Contact (optional)</div>
              <select
                className={selectCls}
                value={appContactId}
                onChange={(e) => setAppContactId(e.target.value)}
              >
                <option value="">None</option>
                {contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                  return (
                    <option key={c.id} value={c.id}>
                      {name} {c.company ? `\u2014 ${c.company}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={saveApplication}
                disabled={savingApp}
                className="w-full rounded-button bg-glow/90 px-4 py-2.5 text-sm font-semibold text-depth-0 transition duration-300 hover:bg-glow active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {savingApp ? "Saving..." : editingAppId ? "Update" : "Add Application"}
              </button>
              {editingAppId && (
                <button
                  onClick={cancelEditApp}
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
          title="Applications"
          subtitle={loadingApps ? "Loading..." : `${applications.length} tracked`}
          right={
            <div className="flex items-center gap-2">
              <div className="flex rounded-button bg-white/[0.04] p-1">
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-badge transition ${
                    viewMode === "table"
                      ? "bg-glow/20 text-glow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-badge transition ${
                    viewMode === "kanban"
                      ? "bg-glow/20 text-glow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Kanban
                </button>
              </div>
              <button
                onClick={loadApplications}
                className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                Refresh
              </button>
            </div>
          }
        >
          {viewMode === "table" ? (
            <div className="mt-2 rounded-section bg-depth-0/40">
              <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_0.8fr] items-center gap-3 px-4 py-3 text-xs text-white/30 font-medium">
                <div>Company</div>
                <div>Link</div>
                <div>Date</div>
                <div>Status</div>
                <div>Action</div>
              </div>
              <div className="h-px w-full bg-white/[0.04]" />

              {loadingApps ? (
                <div className="px-4 py-8 text-center text-sm text-white/40">Loading applications...</div>
              ) : applications.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-white/50">No applications tracked yet.</p>
                  <p className="mt-1 text-xs text-white/25">
                    The process is the progress. Start tracking.
                  </p>
                </div>
              ) : (
                applications.map(app => (
                  <div key={app.id}>
                    <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_0.8fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                      <div className="font-medium text-white truncate">{app.company}</div>
                      <div className="min-w-0 truncate text-sm">
                        {app.link ? (
                          <a href={app.link} target="_blank" rel="noreferrer" className="text-glow hover:underline">
                            View Link
                          </a>
                        ) : <span className="text-white/20">{"\u2014"}</span>}
                      </div>
                      <div className="font-data text-white/40">{app.date_applied || "\u2014"}</div>
                      <div className="text-sm">
                        <span className={`inline-block rounded-badge px-2 py-1 text-xs font-medium ${STATUS_STYLE[app.status] ?? "bg-white/[0.04] text-white/50"}`}>
                          {app.status}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditApp(app)}
                          className="text-xs font-medium text-white/35 transition-colors hover:text-white cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteApplication(app.id)}
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
          ) : (
            <div className="mt-4">
              {loadingApps ? (
                <div className="text-center py-8 text-white/40">Loading applications...</div>
              ) : applications.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-white/50">No applications tracked yet.</p>
                  <p className="mt-1 text-xs text-white/25">
                    The process is the progress. Start tracking.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-4">
                  {KANBAN_COLUMNS.map((columnStatus) => (
                    <div key={columnStatus} className="flex flex-col">
                      <div className="mb-3 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-glow">{columnStatus}</h3>
                        <span className="text-xs font-data text-white/40">
                          {applications.filter((app) => app.status === columnStatus).length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {applications
                          .filter((app) => app.status === columnStatus)
                          .map((app) => (
                            <div
                              key={app.id}
                              className="rounded-input bg-depth-1/40 border border-white/[0.04] p-3 transition hover:border-glow/20"
                            >
                              <div className="text-sm font-medium text-white truncate mb-2">
                                {app.company}
                              </div>
                              {app.link && (
                                <a
                                  href={app.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-glow hover:underline block truncate mb-2"
                                >
                                  View Role
                                </a>
                              )}
                              <div className="text-xs text-white/40 mb-3 font-data">
                                {app.date_applied || "No date"}
                              </div>
                              <select
                                value={app.status}
                                onChange={(e) => updateApplicationStatus(app.id, e.target.value)}
                                disabled={updatingStatusId === app.id}
                                className={selectCls + " text-xs"}
                              >
                                <option value="Bookmarked">Bookmarked</option>
                                <option value="Applied">Applied</option>
                                <option value="Interview">Interview</option>
                                <option value="Offer">Offer</option>
                                <option value="Rejected">Rejected</option>
                              </select>
                              <div className="flex gap-2 mt-2 text-[11px]">
                                <button
                                  onClick={() => startEditApp(app)}
                                  className="text-white/35 hover:text-white transition-colors flex-1 cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteApplication(app.id)}
                                  className="text-danger/50 hover:text-danger transition-colors flex-1 cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
