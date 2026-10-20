import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="shell-loading" role="status">
          Opening workspace…
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
