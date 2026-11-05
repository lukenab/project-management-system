import type { Metadata } from "next";

import { AdminRoute } from "@/components/admin/AdminRoute";
import { AuditLog } from "@/components/admin/AuditLog";
import { PageHeader } from "@/components/shared/PageHeader";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditEventsPage() {
  return (
    <AdminRoute>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Review administrative actions across the system. Events are read-only."
      />
      <AuditLog />
    </AdminRoute>
  );
}
