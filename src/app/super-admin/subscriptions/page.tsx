import { KPICard } from "@/components/super-admin/KPICard";
import { CreditCard, Ban, TrendingDown, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const dynamic = 'force-dynamic';

export default function SubscriptionsPage() {
  return (
    <div className="space-y-8 pb-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl tablet:text-3xl font-bold text-text-primary">
            Subscriptions
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage school billing and subscription plans
          </p>
        </div>
      </div>

      {/* TOP STATS ROW */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-6">
        <KPICard 
          title="Total Subscriptions" 
          value={0} 
          icon={<CreditCard className="w-6 h-6" />} 
          trendDirection="neutral"
        />
        <KPICard 
          title="Active Paid Plans" 
          value={0} 
          icon={<CheckCircle className="w-6 h-6" />} 
          trendDirection="neutral"
        />
        <KPICard 
          title="Monthly Revenue / MRR" 
          value="$0" 
          icon={<CreditCard className="w-6 h-6" />} 
          trendDirection="neutral"
        />
        <KPICard 
          title="Churned This Month" 
          value={0} 
          icon={<TrendingDown className="w-6 h-6" />} 
          trendDirection="neutral"
        />
      </div>

      {/* PLAN CONFIGURATION */}
      <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 flex flex-col tablet:flex-row justify-between items-start tablet:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Plan Configuration</h3>
          <p className="text-sm text-text-secondary mt-1">
            Subscription plans will be defined here. Contact the product lead before making changes.
          </p>
        </div>
        <Button variant="primary" disabled className="shrink-0 cursor-not-allowed opacity-50">
          Configure Plans
        </Button>
      </div>

      {/* SUBSCRIPTIONS TABLE PLACEHOLDER */}
      <div>
        <div className="rounded-2xl overflow-hidden border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg text-xs uppercase tracking-wide text-text-muted border-b border-border">
                  <th className="px-6 py-4 font-medium">School Name</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Next Billing</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-6 py-12">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center">
                      <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        Subscription system coming soon
                      </h3>
                      <p className="text-text-secondary text-sm mb-6 leading-relaxed">
                        This section will track all school subscriptions, payments, and billing history. Pricing plans will be configured here once the subscription model is finalised.
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
