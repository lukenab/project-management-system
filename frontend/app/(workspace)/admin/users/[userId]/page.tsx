import type { Metadata } from "next";

import { AdminRoute } from "@/components/admin/AdminRoute";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";

// Preview accounts live in browser memory, so the server cannot name them yet.
export const metadata: Metadata = { title: "Account details" };

export default async function AdminUserPage({
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
