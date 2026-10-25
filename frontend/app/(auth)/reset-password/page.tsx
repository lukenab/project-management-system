import type { Metadata } from "next";

import { Suspense } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordPage } from "@/components/auth/ResetPasswordPage";

export const metadata: Metadata = { title: "Reset password" };
type SearchParams = Promise<{ token?: string | string[] }>;
async function ResetContent({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  return (
    <ResetPasswordPage
      hasToken={typeof token === "string" && token.trim().length > 0}
    />
  );
}
export default function ResetPasswordRoute({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Reset your password"
          description="Opening your reset link…"
        >
          <p role="status">Loading…</p>
        </AuthCard>
      }
    >
      <ResetContent searchParams={searchParams} />
    </Suspense>
  );
}
