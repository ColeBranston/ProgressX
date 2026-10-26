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

// Google AdSense account, verified with the meta tag below. AdSense's own ad script isn't loaded: the
// feed's video ads come through Google's IMA player (internal_components/videos/ima.ts), and AdSense's
// policies don't allow ad code on screens without content (login, consent, settings and so on).
const ADSENSE_CLIENT = "ca-pub-1603241710061273"

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
