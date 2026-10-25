import { notFound } from "next/navigation";

import { AuthPreview } from "@/components/auth/AuthPreview";

export default function AuthPreviewRoute() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AuthPreview />;
}
