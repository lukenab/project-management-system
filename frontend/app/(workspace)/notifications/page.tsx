import type { Metadata } from "next";

import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { PageHeader } from "@/components/shared/PageHeader";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Stay up to date on mentions and changes to your work."
      />
      <NotificationCenter />
    </>
  );
}
