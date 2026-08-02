"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UserGrowthChartProps {
  data: { month: string; users: number }[];
}

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-[400px] flex flex-col items-center justify-center text-center">
        <p className="text-text-primary font-medium mb-2">No data yet</p>
        <p className="text-text-secondary text-sm">Data will appear as schools join the platform</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-[400px] flex flex-col">
      <h3 className="text-lg font-bold text-text-primary mb-6">User Growth</h3>
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 10,
              left: 0,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: "#64748B", fontSize: 12 }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: "#64748B", fontSize: 12 }} 
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "12px",
                border: "1px solid #E2E8F0",
                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
              }}
              labelStyle={{ color: "#64748B", marginBottom: "4px" }}
              itemStyle={{ color: "#2563EB", fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="users"
              name="Total Users"
              stroke="#2563EB"
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: "#2563EB" }}
              activeDot={{ r: 6, strokeWidth: 0, fill: "#2563EB" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
