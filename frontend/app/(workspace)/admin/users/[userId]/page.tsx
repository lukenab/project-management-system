import type { Metadata } from "next";

import { Suspense } from "react";

import { AdminRoute } from "@/components/admin/AdminRoute";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";
import { WorkspaceLoading } from "@/components/layout/WorkspaceLoading";

export const metadata: Metadata = { title: "Account details" };

async function AccountContent({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return (
    <AdminRoute>
      <AdminUserDetail key={userId} userId={userId} />
    </AdminRoute>
  );
}

export default function AdminUserPage(props: {
  params: Promise<{ userId: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AccountContent {...props} />
    </Suspense>
  );
}
