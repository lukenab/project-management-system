import type { Metadata } from "next";

import { SignUpPage } from "@/components/auth/SignUpPage";

export const metadata: Metadata = { title: "Create account" };
export default function SignUpRoute() {
  return <SignUpPage />;
}
