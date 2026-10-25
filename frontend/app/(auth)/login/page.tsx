import type { Metadata } from "next";

import { LoginPage } from "@/components/auth/LoginPage";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Project Management workspace.",
};

export default function LoginRoute() {
  return <LoginPage />;
}
