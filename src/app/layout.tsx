import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import PwaRegister from "@/components/pwa/pwa-register";
import InstallGate from "@/components/pwa/install-gate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hajira — Smart Attendance Platform",
  description:
    "Attendance in 60 seconds — proxy-proof, effortless. Rotating QR, GPS geofence, device binding and Excel archive.",
  applicationName: "Hajira",
  appleWebApp: {
    capable: true,
    title: "Hajira",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#241C15",
  // Let content reach under the notch; the footer already respects
  // env(safe-area-inset-bottom) for the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
      >
        {/* Capture Chrome's install event before React mounts — never miss it.
            Plus a boot watchdog: if the app never hydrates (chunks 404'd from a
            stale service-worker shell after a deploy, or a dead hydration), the
            page LOOKS loaded but is frozen — the #1 "platform won't load" report.
            After 15s online with no boot, purge every hajira cache + SW and
            reload once (sessionStorage guard prevents a loop). Runs as plain
            inline JS precisely because React may never mount. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hajiraInstallEvt=e;window.dispatchEvent(new Event('hajira:install-ready'));})}catch(_){};" +
              "setTimeout(function(){try{" +
              "if(window.__hajiraBooted)return;" +
              "if(navigator.onLine===false)return;" +
              "if(sessionStorage.getItem('hajira-healed')==='1')return;" +
              "sessionStorage.setItem('hajira-healed','1');" +
              "console.warn('[hajira] app did not boot — purging cached app and reloading');" +
              "(async function(){try{" +
              "if(window.caches){var ks=await caches.keys();await Promise.all(ks.filter(function(k){return k.indexOf('hajira-')===0}).map(function(k){return caches.delete(k)}));}" +
              "if(navigator.serviceWorker){var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(function(r){return r.unregister()}));}" +
              "}catch(_){}location.reload();})();" +
              "}catch(_){}},15000);",
          }}
        />
        {children}
        <Toaster />
        <PwaRegister />
        <InstallGate />
      </body>
    </html>
  );
}
