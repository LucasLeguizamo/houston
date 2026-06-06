import type { ReactNode } from "react";
import { Button, Empty, cn } from "@houston-ai/core";

/** Centered empty-state frame for the Company Bible screen. */
export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Empty>{children}</Empty>
    </div>
  );
}

/** Bible / Recommendations segmented-tab button. */
export function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("h-7 gap-1.5 px-3 text-xs", active && "bg-background shadow-sm")}
    >
      {children}
    </Button>
  );
}
