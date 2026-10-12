import type { Metadata, Viewport } from "next";
import { UiPrefsBoot } from "./ui-prefs-boot";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RxPad BD", template: "%s · RxPad BD" },
  description: "Prescription writing for Bangladeshi doctors",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export const viewport: Viewport = { themeColor: "#0f6f67" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Extensions (Grammarly, ColorZilla, …) inject attributes onto <body> before hydrate. */}
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        <UiPrefsBoot />
        {children}
      </body>
    </html>
  );
}
