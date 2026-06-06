import type { ReactNode } from "react";

// Shared focused-card frame for the onboarding, matching the UiTour coachmark.
export function PrdCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-black/5 bg-background p-6 shadow-[0_10px_40px_rgba(0,0,0,0.10)]">
      {children}
    </div>
  );
}
