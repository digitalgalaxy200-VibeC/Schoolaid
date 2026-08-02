"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface SchoolsStatusChartProps {
  data: { name: string; value: number; color: string }[];
  totalCount: number;
}

export function SchoolsStatusChart({ data, totalCount }: SchoolsStatusChartProps) {
  if (!data || data.length === 0 || totalCount === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-[400px] flex flex-col items-center justify-center text-center">
        <p className="text-text-primary font-medium mb-2">No data yet</p>
        <p className="text-text-secondary text-sm">Data will appear as schools join the platform</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-[400px] flex flex-col relative">
      <h3 className="text-lg font-bold text-text-primary mb-2">Schools by Status</h3>
      <div className="flex-1 w-full min-h-0 relative">
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
          <span className="text-3xl font-bold text-text-primary">{totalCount}</span>
          <span className="text-xs text-text-muted uppercase tracking-wide">Total</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
              }}
              itemStyle={{ fontWeight: 500 }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              iconType="circle"
              wrapperStyle={{ fontSize: "14px", color: "#64748B" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
