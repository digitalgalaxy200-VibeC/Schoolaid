import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { createClient } from "@/lib/supabase/server";
import { KPICard } from "@/components/super-admin/KPICard";
import { SchoolsTable } from "@/components/super-admin/SchoolsTable";
import { UserGrowthChart } from "@/components/super-admin/UserGrowthChart";
import { SchoolsStatusChart } from "@/components/super-admin/SchoolsStatusChart";
import { ActivityFeed } from "@/components/super-admin/ActivityFeed";
import { AlertsPanel } from "@/components/super-admin/AlertsPanel";
import { Users, School, CreditCard, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const dynamic = 'force-dynamic';

async function checkAuth() {
  const cookieStore = await cookies();
  const customSession = cookieStore.get("schoolaid-session")?.value;
  let isSuperAdmin = false;
  let adminName = "Admin";

  if (customSession) {
    try {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-insecure-secret"
      );
      const { payload } = await jwtVerify(customSession, secret);
      if (payload.role === "super_admin") {
        isSuperAdmin = true;
        if (payload.email) adminName = (payload.email as string).split("@")[0];
      }
    } catch (e) {
      // ignore
    }
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
       const { data: userProfile } = await supabase.from('users').select('role, full_name').eq('id', data.user.id).single();
       if (userProfile?.role === "super_admin") {
         isSuperAdmin = true;
         adminName = userProfile.full_name || "Admin";
       }
    }
  }

  if (!isSuperAdmin) {
    redirect("/unauthorized");
  }

  return { adminName };
}

export default async function SuperAdminDashboard() {
  const { adminName } = await checkAuth();
  
  // MOCK DATA FETCHING (to be replaced with actual DB queries when schema is final)
  
  // Row 1: Schools & Users
  const totalSchools = 42;
  const activeSchools = 38;
  const totalUsers = 2847;
  const newUsersMonth = 142;

  // Row 2: Revenue & Health
  const activeSubscriptions = 0; // Placeholder
  const monthlyRevenue = 0; // Placeholder
  const systemErrors = 0; 
  const dormantSchools = totalSchools - activeSchools;

  // Charts Data
  const userGrowthData = [
    { month: "Jan", users: 1200 },
    { month: "Feb", users: 1450 },
    { month: "Mar", users: 1800 },
    { month: "Apr", users: 2100 },
    { month: "May", users: 2450 },
    { month: "Jun", users: 2847 },
  ];

  const schoolsStatusData = [
    { name: "Active", value: activeSchools, color: "#16A34A" },
    { name: "Dormant", value: dormantSchools, color: "#94A3B8" },
    { name: "New", value: 4, color: "#2563EB" },
  ];

  // Table Data
  const mockSchoolsData = [
    {
      id: "s1",
      name: "St. Mary's School",
      location: "London, UK",
      plan: "Pro" as const,
      usersCount: 450,
      lastActive: "2 hours ago",
      status: "Active" as const,
    },
    {
      id: "s2",
      name: "Sunrise Academy",
      location: "New York, USA",
      plan: "Starter" as const,
      usersCount: 120,
      lastActive: "3 days ago",
      status: "Active" as const,
    },
    {
      id: "s3",
      name: "Oakridge High",
      location: "Sydney, AU",
      plan: "Free" as const,
      usersCount: 45,
      lastActive: "2 weeks ago",
      status: "Dormant" as const,
    }
  ];

  // Feeds & Alerts
  const mockEvents = [
    {
      id: "e1",
      eventType: "school_joined" as const,
      description: "Westwood High joined the platform",
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: "e2",
      eventType: "user_joined" as const,
      description: "Jane Doe joined St. Mary's School",
      createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    }
  ];

  const mockAlerts = [
    {
      id: "a1",
      type: "expiring_soon" as const,
      title: "Sunrise Academy",
      description: "Subscription expires in 3 days",
      schoolId: "s2"
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* SECTION 1 - PAGE HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl tablet:text-3xl font-bold text-text-primary">
            Good morning, {adminName} <span className="inline-block animate-wave">👋</span>
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Platform overview · Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
        <Button variant="secondary" size="sm">
          Refresh Data
        </Button>
      </div>

      {/* SECTION 2 - KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-6">
        <KPICard 
          title="Total Schools" 
          value={totalSchools} 
          icon={<School className="w-6 h-6" />} 
          trend={12} 
          trendLabel="since last month" 
        />
        <KPICard 
          title="Active Schools" 
          value={activeSchools} 
          icon={<School className="w-6 h-6" />} 
          trend={5} 
          trendLabel="since last month" 
        />
        <KPICard 
          title="Total Users" 
          value={totalUsers.toLocaleString()} 
          icon={<Users className="w-6 h-6" />} 
          trend={142} 
          trendLabel="since last month" 
          trendDirection="up"
        />
        <KPICard 
          title="New This Month" 
          value={newUsersMonth} 
          icon={<Users className="w-6 h-6" />} 
          trend={-10} 
          trendLabel="vs last month" 
        />
        
        <KPICard 
          title="Active Subscriptions" 
          value={activeSubscriptions} 
          icon={<CreditCard className="w-6 h-6" />} 
          trendDirection="neutral"
          trendLabel="Coming soon"
        />
        <KPICard 
          title="Monthly Revenue (MRR)" 
          value={`$${monthlyRevenue}`} 
          icon={<CreditCard className="w-6 h-6" />} 
          trendDirection="neutral"
          trendLabel="Coming soon"
        />
        <KPICard 
          title="System Errors" 
          value={systemErrors} 
          icon={<AlertOctagon className="w-6 h-6" />} 
          trend={systemErrors > 0 ? systemErrors : 0} 
          trendDirection={systemErrors > 0 ? "down" : "neutral"}
          trendLabel="last 24 hours" 
        />
        <KPICard 
          title="Dormant Schools" 
          value={dormantSchools} 
          icon={<School className="w-6 h-6" />} 
          trend={-2} 
          trendLabel="since last month" 
          trendDirection="down"
        />
      </div>

      {/* SECTION 3 - CHARTS ROW */}
      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-6">
        <UserGrowthChart data={userGrowthData} />
        <SchoolsStatusChart data={schoolsStatusData} totalCount={totalSchools} />
      </div>

      {/* SECTION 4 - SCHOOLS TABLE */}
      <div>
        <SchoolsTable initialSchools={mockSchoolsData} />
      </div>

      {/* SECTION 5 - BOTTOM ROW */}
      <div className="grid grid-cols-1 desktop:grid-cols-5 gap-6">
        <div className="desktop:col-span-3">
          <ActivityFeed events={mockEvents} />
        </div>
        <div className="desktop:col-span-2">
          <AlertsPanel alerts={mockAlerts} />
        </div>
      </div>
    </div>
  );
}
