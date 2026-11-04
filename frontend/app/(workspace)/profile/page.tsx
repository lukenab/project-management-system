import type { Metadata } from "next";

import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { PageHeader } from "@/components/shared/PageHeader";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Manage your personal information and password."
      />
      <ProfileSettings />
    </>
  );
}
