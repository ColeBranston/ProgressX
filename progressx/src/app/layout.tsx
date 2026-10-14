import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import './global.css';
import { SITE_URL } from './siteUrl';

import { IsLoadingProvider } from './contexts/isLoading'
import LoadingScreen  from './internal_components/LoadingScreen'
import { UserDataProvider } from "./contexts/userData";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Google AdSense: the meta tag verifies the site is ours, and the script serves AdSense ads. AdSense
// ads are non-personalized for everyone (the feed's video ads handle the personalized-ads opt-in
// themselves, see internal_components/videos/ima.ts). AdSense only reads that setting if it's made
// before its script runs, so the script is added by the same inline snippet, right after it.
const ADSENSE_CLIENT = "ca-pub-1603241710061273"
const ADSENSE_LOADER = `(window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
var s = document.createElement("script");
s.async = true;
s.crossOrigin = "anonymous";
s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}";
document.head.appendChild(s);`

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL), // canonical addresses resolve against this
  title: "ProgressX",
  description: "Fitness Social Media App",
  other: { "google-adsense-account": ADSENSE_CLIENT },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* AdSense puts its own script before the first one on the page (this one), which React would report as a mismatch */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ADSENSE_LOADER }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
          <UserDataProvider>
            <IsLoadingProvider>
              <LoadingScreen/>
              {children}
            </IsLoadingProvider>
          </UserDataProvider>
      </body>
    </html>
  );
}
