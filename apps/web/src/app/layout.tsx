import type { Metadata, Viewport } from "next";
import Script from "next/script";
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

/** Apply saved display prefs before paint (avoids a flash of default size). */
const UI_PREFS_BOOT = `(function(){try{var p=JSON.parse(localStorage.getItem("rx.uiPrefs")||"{}");var legF={small:0.5,default:1,large:1.5};var legS={compact:0.5,default:1,roomy:1.5};function n(v,leg){if(typeof v==="number"&&isFinite(v))return Math.min(2.5,Math.max(0.5,Math.round(v*2)/2));if(typeof v==="string"&&leg[v]!=null)return leg[v];var x=Number(v);return isFinite(x)?Math.min(2.5,Math.max(0.5,Math.round(x*2)/2)):1}var d=document.documentElement;d.style.setProperty("--rx-font-scale",String(n(p.font,legF)));d.style.setProperty("--rx-pad-scale",String(n(p.padding,legS)));d.style.setProperty("--rx-gap-scale",String(n(p.gap,legS)));}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Extensions (Grammarly, ColorZilla, …) inject attributes onto <body> before hydrate. */}
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        <Script id="rx-ui-prefs" strategy="beforeInteractive">
          {UI_PREFS_BOOT}
        </Script>
        {children}
      </body>
    </html>
  );
}
