"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="text-center max-w-sm">
            <h2 className="text-h2 font-bold mb-2">Something went wrong</h2>
            <p className="text-small text-text-muted mb-4">{error.message}</p>
            <button onClick={reset} className="px-4 py-2 bg-primary text-white rounded-sm text-small">Try again</button>
          </div>
        </div>
      </body>
    </html>
  );
}
