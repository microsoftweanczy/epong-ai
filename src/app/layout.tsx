import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FamilyChat - Chat with your family",
  description: "A private, real-time WhatsApp-style chat for your family. Free and simple.",
  keywords: ["FamilyChat", "chat", "family", "messaging", "WhatsApp clone"],
  authors: [{ name: "FamilyChat" }],
  openGraph: {
    title: "FamilyChat",
    description: "A private real-time chat for your family",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FamilyChat",
    description: "A private real-time chat for your family",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1E3A8A",
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
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
