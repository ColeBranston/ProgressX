import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import './global.css';
import { IsLoadingProvider } from './contexts/isLoading'
import LoadingScreen  from './components/LoadingScreen'
import { UserDataProvider } from "./contexts/userData";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProgressX",
  description: "Fitness Social Media App",
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
