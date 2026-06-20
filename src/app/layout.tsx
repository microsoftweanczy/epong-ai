import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Aria — Your Personal AI",
  description:
    "A beautiful personal AI chatbot powered by GLM. iOS 26 Liquid Glass design, Supabase-backed, Vercel-ready.",
  keywords: ["AI", "chatbot", "GLM", "assistant", "Aria"],
  authors: [{ name: "Aria" }],
  openGraph: {
    title: "Aria — Your Personal AI",
    description: "A beautiful personal AI chatbot powered by GLM.",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aria",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#6366F1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
