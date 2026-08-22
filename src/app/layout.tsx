import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Wisher — Wishlists",
  description: "Create and share wishlists with friends and family.",
  manifest: "/manifest.webmanifest",
  applicationName: "Wisher",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <RegisterSW />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
