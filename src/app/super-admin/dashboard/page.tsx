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
  
  const supabase = await createClient();
  
  // Fetch real data
  const { data: schoolsData } = await supabase.from("schools").select("id, name, address, subscription_status, is_archived, created_at");
  const { data: profilesData } = await supabase.from("profiles").select("id, school_id, created_at");
  const { data: subscriptionsData } = await supabase.from("subscriptions").select("id, plan, status, school_id");

  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const totalSchools = schoolsData?.length || 0;
  const activeSchools = schoolsData?.filter((s) => s.subscription_status === "active" || s.subscription_status === "trial" || !s.is_archived).length || 0;
  const totalUsers = profilesData?.length || 0;
  const newUsersMonth = profilesData?.filter((p) => p.created_at && new Date(p.created_at) >= currentMonthStart).length || 0;

  const activeSubscriptions = subscriptionsData?.filter(s => s.status === 'active').length || 0; 
  const monthlyRevenue = 0; 
  const systemErrors = 0; 
  const dormantSchools = totalSchools - activeSchools;

  // Charts Data
  const userGrowthData: { month: string; users: number }[] = [];

  const schoolsStatusData = [
    { name: "Active", value: activeSchools, color: "#16A34A" },
    { name: "Dormant", value: dormantSchools, color: "#94A3B8" },
  ].filter(d => d.value > 0);

  // Table Data
  const mappedSchoolsData = schoolsData?.map((school) => {
    const schoolUsersCount = profilesData?.filter((p) => p.school_id === school.id).length || 0;
    const sub = subscriptionsData?.find((s) => s.school_id === school.id);
    let plan: "Free" | "Starter" | "Pro" | "Enterprise" = "Free";
    if (sub?.plan) {
      const p = sub.plan.toLowerCase();
      if (p.includes("pro")) plan = "Pro";
      else if (p.includes("starter")) plan = "Starter";
      else if (p.includes("enterprise")) plan = "Enterprise";
    }

    return {
      id: school.id,
      name: school.name || "Unknown School",
      location: school.address || "Unknown Location",
      plan,
      usersCount: schoolUsersCount,
      lastActive: "N/A", // Need activity log for this
      status: school.is_archived ? "Suspended" : (school.subscription_status === 'active' ? "Active" : "Dormant") as "Active" | "Dormant" | "Suspended",
    };
  }) || [];

  // Feeds & Alerts
  const mockEvents: any[] = [];
  const mockAlerts: any[] = [];

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
        <SchoolsTable initialSchools={mappedSchoolsData} />
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
