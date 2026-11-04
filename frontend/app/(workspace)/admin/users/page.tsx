import type { Metadata } from "next";

import { AdminRoute } from "@/components/admin/AdminRoute";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { PageHeader } from "@/components/shared/PageHeader";

export const metadata: Metadata = { title: "User accounts" };

export default function AdminUsersPage() {
  return (
    <AdminRoute>
      <PageHeader
        eyebrow="Administration"
        title="User accounts"
        description="Review accounts and manage their access to the system."
      />
      <AdminUserList />
    </AdminRoute>
  );
}
