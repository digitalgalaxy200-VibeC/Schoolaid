"use client";

import { Button } from "@/components/ui";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("School Admin Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="text-center max-w-sm">
        <div className="text-display mb-4 opacity-30">⚠️</div>
        <h2 className="text-h2 font-bold mb-2">Something went wrong</h2>
        <p className="text-small text-text-muted mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="ghost" onClick={() => window.location.href = "/super-admin/dashboard"}>
            Back to Super Admin
          </Button>
        </div>
      </div>
    </div>
  );
}
