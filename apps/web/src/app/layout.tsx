import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RxPad BD", template: "%s · RxPad BD" },
  description: "Prescription writing for Bangladeshi doctors",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0f6f67" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
