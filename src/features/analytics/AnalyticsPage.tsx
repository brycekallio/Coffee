import { countByStatus } from "@/features/applications/statuses";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import type { ScheduledOutreach } from "@/types";
import { useContacts } from "@/features/contacts/contactsContext";
import { useApplications } from "@/features/applications/useApplications";
import { listScheduledOutreach } from "@/features/outreach/api";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/** The one data hue (brand cyan). Every chart uses it; status lives in the axis labels. */
const CHART_HUE = "#00E5FF";

export default function AnalyticsPage() {
  const { contacts } = useContacts();
  const { applications } = useApplications();
  const [scheduledOutreach, setScheduledOutreach] = useState<ScheduledOutreach[]>([]);

  useEffect(() => {
    // Charts degrade to empty rather than erroring, so a failed load is only logged.
    listScheduledOutreach().then(setScheduledOutreach, (e) =>
      console.error("Failed to load scheduled outreach:", e),
    );
  }, []);

  // Data: Applications by status
  const appsByStatus = useMemo(() => countByStatus(applications), [applications]);

  // Data: Outreach by channel
  const outreachByChannel = useMemo(() => {
    const counts: Record<string, number> = {};
    scheduledOutreach.forEach((o) => {
      counts[o.channel] = (counts[o.channel] || 0) + 1;
    });
    return Object.entries(counts).map(([channel, count]) => ({ channel, count }));
  }, [scheduledOutreach]);

  // Data: Contacts added over time
  const contactsOverTime = useMemo(() => {
    const byDate: Record<string, number> = {};
    contacts.forEach((c) => {
      if (!c.created_at) return; // nullable in the schema
      const date = c.created_at.split("T")[0]; // YYYY-MM-DD
      byDate[date] = (byDate[date] || 0) + 1;
    });

    return Object.entries(byDate)
      .sort()
      .reduce(
        (acc, [date, count]) => {
          const prev = acc[acc.length - 1];
          const cumulative = (prev?.cumulative || 0) + count;
          acc.push({ date, added: count, cumulative });
          return acc;
        },
        [] as Array<{ date: string; added: number; cumulative: number }>
      )
      .slice(-30); // Last 30 days only
  }, [contacts]);

  // Data: Top companies applied to
  const topCompanies = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach((app) => {
      counts[app.company] = (counts[app.company] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [applications]);

  // Colors for status bar chart

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 md:px-6">
      {/* Applications by Status */}
      <Card title="Applications by status" subtitle={`${applications.length} total`}>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={appsByStatus}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="status"
                stroke="rgba(255,255,255,0.6)" tickLine={false}
                style={{ fontSize: "12px" }}
              />
              <YAxis stroke="rgba(255,255,255,0.6)" tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(11, 31, 42, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0.75rem",
                  color: "white",
                }}
                formatter={(value) => `${value} apps`}
              />
              <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={96}>
                {appsByStatus.map((entry) => (
                  <Cell key={entry.status} fill={CHART_HUE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Contacts Added Over Time */}
        <Card
          title="People added"
          subtitle={`${contacts.length} in your network`}
        >
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={contactsOverTime}
                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.6)" tickLine={false}
                  style={{ fontSize: "11px" }}
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="rgba(255,255,255,0.6)" tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(11, 31, 42, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    color: "white",
                  }}
                />
                <Line
                  type="linear"
                  dataKey="cumulative"
                  stroke={CHART_HUE}
                  dot={false}
                  strokeWidth={2}
                  name="Total"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Outreach by Channel */}
        <Card
          title="Outreach by channel"
          subtitle={`${scheduledOutreach.length} total outreach`}
        >
          <div className="mt-4 space-y-3">
            {outreachByChannel.length > 0 ? (
              outreachByChannel.map((item) => (
                <div key={item.channel} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white capitalize">
                      {item.channel === "sms" ? "SMS" : item.channel}
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full bg-glow"
                        style={{
                          width: `${
                            (item.count /
                              Math.max(...outreachByChannel.map((c) => c.count))) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="font-data text-right text-sm font-medium text-glow">
                    {item.count}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/40">No outreach scheduled yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Top Companies Applied To */}
      <Card
        title="Companies applied to"
        subtitle={`Tracking ${topCompanies.length} top targets`}
      >
        <div className="mt-4 space-y-2">
          {topCompanies.length > 0 ? (
            topCompanies.map((item, idx) => (
              <div key={item.company} className="flex items-center gap-3 rounded-input bg-depth-1/40 px-4 py-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-badge bg-glow/15 text-xs font-bold text-glow">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {item.company || "Unknown"}
                  </div>
                </div>
                <div className="font-data text-sm font-medium text-white/50">
                  {item.count} {item.count === 1 ? "app" : "apps"}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-input bg-depth-1/40 px-4 py-6 text-center">
              <p className="text-sm text-white/40">
                Start tracking applications to see top companies.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
