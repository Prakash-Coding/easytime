import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EasyTime — Your people. Your time.",
  description: "Private time tracking, scheduling, manager review and gross payroll preparation for your stores.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
