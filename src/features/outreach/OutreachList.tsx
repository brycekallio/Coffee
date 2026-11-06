import type { ScheduledOutreach } from "@/types";
import Card from "@/components/ui/Card";
import { formatWhen } from "./format";

type MarkStatus = (
  id: string,
  status: "sent" | "skipped" | "opened" | "scheduled",
  from: string | string[],
) => void;

export function UpcomingCard({
  loading, scheduledItems, isDue, contactNameById, loadItems, handleSendItem, markStatus, startEdit, deleteItem,
}: {
  loading: boolean;
  scheduledItems: ScheduledOutreach[];
  isDue: (item: ScheduledOutreach) => boolean;
  contactNameById: (id: string | null) => string;
  loadItems: () => void;
  handleSendItem: (item: ScheduledOutreach) => void;
  markStatus: MarkStatus;
  startEdit: (item: ScheduledOutreach) => void;
  deleteItem: (id: string) => void;
}) {
  return (
    <Card
      title="Upcoming"
      subtitle={loading ? "Loading..." : `${scheduledItems.length} scheduled`}
      right={
        <button
          onClick={loadItems}
          className="rounded-button bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
        >
          Refresh
        </button>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-white/60">Loading outreach...</div>
      ) : scheduledItems.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-white/60">No scheduled outreach yet.</p>
          <p className="mt-1 text-xs text-white/60">
            The follow-up is where the magic happens.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {scheduledItems.map((item) => {
            const due = isDue(item);

            return (
              <div
                key={item.id}
                className={`rounded-section p-4 transition ${
                  due
                    ? "bg-white/[0.05]"
                    : "bg-depth-0/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">
                        {contactNameById(item.contact_id)}
                      </span>
                      <span className="inline-block rounded-badge bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-white/60">
                        {item.channel === "sms" ? "SMS" : item.channel.charAt(0).toUpperCase() + item.channel.slice(1)}
                      </span>
                      {due && (
                        <span className="inline-block rounded-badge bg-glow/[0.1] px-2 py-0.5 text-xs font-medium text-glow breathe">
                          Due now
                        </span>
                      )}
                    </div>
                    {item.subject && (
                      <div className="mt-1 text-sm text-white/60 truncate">
                        {item.subject}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-white/60 line-clamp-2">
                      {item.message}
                    </div>
                    <div className="mt-2 font-data text-xs text-white/60">
                      {formatWhen(item.scheduled_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleSendItem(item)}
                    className={`inline-flex min-h-10 items-center rounded-button px-4 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      due
                        ? "bg-white/[0.08] text-white hover:bg-white/[0.12]"
                        : "bg-glow/[0.08] text-glow hover:bg-glow/15"
                    }`}
                  >
                    Send
                  </button>
                  <button
                    onClick={() => markStatus(item.id, "skipped", "scheduled")}
                    className="inline-flex min-h-10 items-center rounded-button bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    className="inline-flex min-h-10 items-center rounded-button bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.08] cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="inline-flex min-h-10 items-center rounded-button px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:text-danger cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function HistoryCard({
  completedItems, contactNameById, markStatus, deleteItem,
}: {
  completedItems: ScheduledOutreach[];
  contactNameById: (id: string | null) => string;
  markStatus: MarkStatus;
  deleteItem: (id: string) => void;
}) {
  return (
    <Card
      title="History"
      subtitle={`${completedItems.length} completed`}
    >
      <div className="grid gap-2">
        {completedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-input bg-depth-0/20 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white/60 truncate">
                  {contactNameById(item.contact_id)}
                </span>
                <span className="inline-block rounded-badge bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-white/60">
                  {item.channel === "sms" ? "SMS" : item.channel.charAt(0).toUpperCase() + item.channel.slice(1)}
                </span>
                <span className={`inline-block rounded-badge px-2 py-0.5 text-xs font-medium ${
                  item.status === "opened"
                    ? "bg-emerald-500/[0.12] text-emerald-400"
                    : item.status === "sent"
                    ? "bg-glow/[0.08] text-glow"
                    : "bg-white/[0.04] text-white/60"
                }`}>
                  {item.status === "opened" ? "Opened" : item.status === "sent" ? "Sent" : "Skipped"}
                </span>
              </div>
              <div className="mt-0.5 font-data text-xs text-white/60">
                {formatWhen(item.scheduled_at)}
                {item.status === "opened" && item.opened_at && (
                  <span className="ml-2 text-emerald-400">
                    · opened {new Date(item.opened_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
              {item.status === "sent" && item.channel === "email" && (
                <button
                  onClick={() => markStatus(item.id, "opened", "sent")}
                  className="inline-flex min-h-10 items-center text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-400 cursor-pointer whitespace-nowrap"
                >
                  Mark opened
                </button>
              )}
              <button
                onClick={() => deleteItem(item.id)}
                className="inline-flex min-h-10 items-center text-xs font-medium text-white/60 transition-colors hover:text-danger cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
