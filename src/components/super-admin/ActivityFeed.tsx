"use client";

import { Activity, UserPlus, Building, CreditCard, XCircle, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ReactNode } from "react";

export type FeedEvent = {
  id: string;
  eventType: "school_joined" | "user_joined" | "subscription_upgraded" | "subscription_cancelled" | "report_generated" | "super_admin_login";
  description: string;
  createdAt: string;
};

interface ActivityFeedProps {
  events: FeedEvent[];
}

const EventIcon = ({ type }: { type: FeedEvent["eventType"] }) => {
  const iconProps = { className: "w-4 h-4" };
  switch (type) {
    case "school_joined":
      return <div className="p-2 bg-blue-50 text-blue-600 rounded-full"><Building {...iconProps} /></div>;
    case "user_joined":
      return <div className="p-2 bg-green-50 text-green-600 rounded-full"><UserPlus {...iconProps} /></div>;
    case "subscription_upgraded":
      return <div className="p-2 bg-purple-50 text-purple-600 rounded-full"><CreditCard {...iconProps} /></div>;
    case "subscription_cancelled":
      return <div className="p-2 bg-red-50 text-red-600 rounded-full"><XCircle {...iconProps} /></div>;
    case "super_admin_login":
      return <div className="p-2 bg-orange-50 text-orange-600 rounded-full"><ShieldCheck {...iconProps} /></div>;
    default:
      return <div className="p-2 bg-slate-50 text-slate-600 rounded-full"><Activity {...iconProps} /></div>;
  }
};

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-text-primary">Live Activity</h3>
        <div className="flex items-center text-xs font-medium text-success bg-success/10 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-success mr-1.5 animate-pulse"></span>
          Live
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 -mr-2">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted">
            <Activity className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No recent activity. Platform events will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-4">
                <EventIcon type={event.eventType} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium">{event.description}</p>
                </div>
                <span className="text-xs text-text-muted whitespace-nowrap pt-0.5">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {events.length > 0 && (
        <button className="w-full mt-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover rounded-xl transition-colors">
          Load more
        </button>
      )}
    </div>
  );
}
