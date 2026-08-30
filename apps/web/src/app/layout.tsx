import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { MicrosoftClarity } from "@/components/microsoft-clarity";
import { PwaServiceWorker } from "@/components/pwa-service-worker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#000000" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Skyarc Atlas",
  description: "DOOH Location Intelligence, Vendor Management, and Media Planning Platform",
  manifest: "/manifest.webmanifest",
  applicationName: "Atlas",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Skyarc Atlas",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <PwaServiceWorker />
        <MicrosoftClarity />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
