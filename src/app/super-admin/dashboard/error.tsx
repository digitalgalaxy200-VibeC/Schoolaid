"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-error/5 border border-error/20 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h2>
      <p className="text-text-secondary max-w-md mx-auto mb-6">
        We couldn't load the dashboard data. Please try again.
      </p>
      <Button onClick={() => reset()} variant="primary">
        Retry
      </Button>
    </div>
  );
}
