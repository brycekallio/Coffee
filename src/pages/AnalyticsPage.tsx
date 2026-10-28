import Card from "../components/ui/Card";
import type { Application, Contact, ScheduledOutreach } from "../types";
import { useMemo } from "react";
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
  Legend,
} from "recharts";

interface AnalyticsPageProps {
  applications: Application[];
  contacts: Contact[];
  scheduledOutreach: ScheduledOutreach[];
}

export default function AnalyticsPage({
  applications,
  contacts,
  scheduledOutreach,
}: AnalyticsPageProps) {
  // Data: Applications by status
  const appsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    applications.forEach((app) => {
      counts[app.status] = (counts[app.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [applications]);

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
  const STATUS_COLORS: Record<string, string> = {
    Applied: "#00E5FF",
    Interviewing: "#00FFC6",
    Accepted: "#00A8A8",
    Rejected: "#FF6B6B",
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
      {/* Applications by Status */}
      <Card title="Applications by Status" subtitle={`${applications.length} total applications`}>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={appsByStatus}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="status"
                stroke="rgba(255,255,255,0.3)"
                style={{ fontSize: "12px" }}
              />
              <YAxis stroke="rgba(255,255,255,0.3)" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(11, 31, 42, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "0.75rem",
                  color: "white",
                }}
                formatter={(value) => `${value} apps`}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {appsByStatus.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status] || "#00E5FF"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contacts Added Over Time */}
        <Card
          title="Contacts Added Over Time"
          subtitle={`${contacts.length} total contacts`}
        >
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={contactsOverTime}
                margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.3)"
                  style={{ fontSize: "11px" }}
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="rgba(255,255,255,0.3)" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(11, 31, 42, 0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    color: "white",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#00E5FF"
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
          title="Outreach by Channel"
          subtitle={`${scheduledOutreach.length} total outreach`}
        >
          <div className="mt-4 space-y-3">
            {outreachByChannel.length > 0 ? (
              outreachByChannel.map((item) => (
                <div key={item.channel} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white capitalize">
                      {item.channel}
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
        title="Top Companies Applied To"
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
