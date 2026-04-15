"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";

export interface DailyPoint {
  date:    string; // "Apr 3"
  sent:    number;
  opened:  number;
  replies: number;
}

const COLORS = {
  sent:    "#3b82f6",
  opened:  "#10b981",
  replies: "#f59e0b",
};

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-xl text-sm"
      style={{ background: "var(--dropdown-bg)", border: "1px solid var(--card-border)" }}
    >
      <p className="text-xs mb-2" style={{ color: "var(--chart-tick)" }}>{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="capitalize" style={{ color: "var(--chart-legend)" }}>{p.name}</span>
          <span className="ml-auto font-semibold pl-4" style={{ color: "var(--foreground)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardChart({ data }: { data: DailyPoint[] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const tickColor   = isDark ? "rgba(255,255,255,0.35)" : "rgba(15,23,42,0.45)";
  const gridColor   = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
  const legendColor = isDark ? "rgba(255,255,255,0.5)"  : "rgba(15,23,42,0.5)";
  const cursorColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm" style={{ color: "var(--chart-tick)" }}>
        No send activity yet this month
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          {(["sent", "opened", "replies"] as const).map(k => (
            <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COLORS[k]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={COLORS[k]} stopOpacity={0}    />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="date"
          tick={{ fill: tickColor, fontSize: 11 }}
          axisLine={false} tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: tickColor, fontSize: 11 }}
          axisLine={false} tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: cursorColor }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(v) => <span style={{ color: legendColor, textTransform: "capitalize" }}>{v}</span>}
        />
        <Area type="monotone" dataKey="sent"    stroke={COLORS.sent}    fill={`url(#grad-sent)`}    strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="opened"  stroke={COLORS.opened}  fill={`url(#grad-opened)`}  strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="replies" stroke={COLORS.replies} fill={`url(#grad-replies)`} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
