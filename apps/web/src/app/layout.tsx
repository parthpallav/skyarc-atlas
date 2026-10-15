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
  formatDetection: {
    telephone: false,
  },
};

function getRuntimeFlags() {
  const jg = (process.env.JOURNEY_GAPS ?? process.env.NEXT_PUBLIC_JOURNEY_GAPS)?.trim().toLowerCase();
  const journeyGaps = jg === "false" || jg === "0" ? false : true;

  const ad = (process.env.ADTECH_BOOKING ?? process.env.NEXT_PUBLIC_ADTECH_BOOKING)?.trim().toLowerCase();
  const adtechBooking = ad === "true" || ad === "1";

  const orb = (process.env.ORBIT_UI ?? process.env.NEXT_PUBLIC_ORBIT_UI)?.trim().toLowerCase();
  const orbitUi = orb === "true" || orb === "1";

  return { journeyGaps, adtechBooking, orbitUi };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeFlags = getRuntimeFlags();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="atlas-runtime-flags"
          dangerouslySetInnerHTML={{
            __html: `window.__ATLAS_RUNTIME_FLAGS__ = ${JSON.stringify(runtimeFlags)};`,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <PwaServiceWorker />
        <MicrosoftClarity />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
