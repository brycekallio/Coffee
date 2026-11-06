import type { ScheduledOutreach } from "@/types";
import Card from "@/components/ui/Card";
import { failureLabel, formatWhen } from "./format";

export default function NotSentCard({
  failedItems, contactNameById, markStatus, deleteItem,
}: {
  failedItems: ScheduledOutreach[];
  contactNameById: (id: string | null) => string;
  markStatus: (id: string, status: "scheduled", from: string[]) => void;
  deleteItem: (id: string) => void;
}) {
  return (
    <Card title="Not sent" subtitle={`${failedItems.length} need a look`}>
      <div className="grid gap-2">
        {failedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-input bg-depth-0/20 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white/70 truncate">
                  {contactNameById(item.contact_id)}
                </span>
                <span className="inline-block rounded-badge bg-white/[0.04] px-2 py-0.5 text-xs font-medium text-white/30">
                  Email
                </span>
              </div>
              {item.subject && (
                <div className="mt-0.5 text-sm text-white/40 truncate">{item.subject}</div>
              )}
              <div className="mt-1 text-xs font-medium text-danger">{failureLabel(item)}</div>
              <div className="mt-0.5 font-data text-xs text-white/20">
                {formatWhen(item.scheduled_at)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
              <button
                onClick={() => markStatus(item.id, "scheduled", ["failed", "missed"])}
                className="text-xs font-medium text-glow/80 transition-colors hover:text-glow cursor-pointer"
              >
                Retry
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-xs font-medium text-white/60 transition-colors hover:text-danger cursor-pointer"
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
