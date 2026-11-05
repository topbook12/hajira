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
        {/* Capture Chrome's install event before React mounts — never miss it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hajiraInstallEvt=e;window.dispatchEvent(new Event('hajira:install-ready'));})}catch(_){}",
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
