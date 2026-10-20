import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Project Management Website",
    template: "%s | Project Management",
  },
  description:
    "A shared workspace for projects, product priorities, and Sprint delivery.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
