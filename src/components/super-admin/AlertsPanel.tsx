"use client";

import { Button } from "@/components/ui/Button"; // Assuming existing UI button
import { AlertCircle, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { useRouter } from "next/navigation";

export type AlertEvent = {
  id: string;
  type: "payment_overdue" | "expiring_soon" | "dormant" | "system_error";
  title: string;
  description: string;
  schoolId?: string;
};

interface AlertsPanelProps {
  alerts: AlertEvent[];
}

const AlertIcon = ({ type }: { type: AlertEvent["type"] }) => {
  const iconProps = { className: "w-5 h-5" };
  switch (type) {
    case "payment_overdue":
      return <div className="text-red-500"><AlertOctagon {...iconProps} /></div>;
    case "expiring_soon":
      return <div className="text-orange-500"><AlertTriangle {...iconProps} /></div>;
    case "dormant":
      return <div className="text-yellow-500"><AlertCircle {...iconProps} /></div>;
    case "system_error":
      return <div className="text-blue-500"><Info {...iconProps} /></div>;
    default:
      return <div className="text-slate-500"><Info {...iconProps} /></div>;
  }
};

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const router = useRouter();

  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-text-primary">Needs Attention</h3>
        {alerts.length > 0 && (
          <span className="bg-error/10 text-error text-xs font-bold px-2 py-1 rounded-full">
            {alerts.length} Action{alerts.length !== 1 && 's'}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted bg-success/5 rounded-xl border border-success/10 p-6">
            <div className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center mb-3">
              <span className="text-xl">🟢</span>
            </div>
            <p className="font-medium text-text-primary mb-1">All systems healthy</p>
            <p className="text-sm">Nothing needs your attention right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="p-4 rounded-xl border border-border bg-surface-hover/50 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertIcon type={alert.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{alert.title}</p>
                    <p className="text-sm text-text-secondary mt-0.5">{alert.description}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  {alert.type !== "system_error" && (
                    <Button variant="secondary" size="sm" className="h-8 text-xs px-3">
                      Send Reminder
                    </Button>
                  )}
                  {alert.schoolId && (
                    <Button 
                      variant="primary" 
                      size="sm" 
                      className="h-8 text-xs px-3"
                      onClick={() => router.push(`/super-admin/schools/${alert.schoolId}`)}
                    >
                      View School
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
