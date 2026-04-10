"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

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
    <div className="bg-[#0f172a] border border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="text-white/50 text-xs mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-white/70 capitalize">{p.name}</span>
          <span className="ml-auto font-semibold text-white pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-white/25 text-sm">
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
          axisLine={false} tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
          axisLine={false} tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(v) => <span style={{ color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{v}</span>}
        />
        <Area type="monotone" dataKey="sent"    stroke={COLORS.sent}    fill={`url(#grad-sent)`}    strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="opened"  stroke={COLORS.opened}  fill={`url(#grad-opened)`}  strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="replies" stroke={COLORS.replies} fill={`url(#grad-replies)`} strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
