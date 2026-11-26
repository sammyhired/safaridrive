import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SafariDrive — Car Rental Platform",
  description:
    "Book a car in minutes, pay securely with M-Pesa or card, choose pickup, delivery or chauffeur, and track your vehicle live. A two-sided car rental platform for Kenya.",
  keywords: ["car rental", "Kenya", "M-Pesa", "chauffeur", "vehicle tracking", "Nairobi"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "SafariDrive — Car Rental Platform",
    description: "Book. Pay. Drive. Car rental made in Kenya.",
    siteName: "SafariDrive",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
