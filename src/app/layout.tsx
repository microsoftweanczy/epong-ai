import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Epong AI — Asisten Pribadi Anda",
  description:
    "Asisten AI pribadi yang indah didukung oleh GLM. Desain iOS 26 Liquid Glass, didukung Supabase, siap untuk Vercel.",
  keywords: ["AI", "chatbot", "GLM", "asisten", "Epong AI", "Bahasa Indonesia"],
  authors: [{ name: "Epong AI" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Epong AI",
  },
  openGraph: {
    title: "Epong AI — Asisten Pribadi Anda",
    description: "Asisten AI pribadi yang indah didukung oleh GLM.",
    type: "website",
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
      <head>
        {/* Apply theme before hydration to prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem('epong-theme')||'{}').state;var m=t?t.mode:'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        {/* Register service worker for PWA / APK support */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
