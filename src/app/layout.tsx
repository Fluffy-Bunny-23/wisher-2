import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wisher — Smart Wishlist Manager",
  description: "Create, share and manage wishlists. Built with shadcn + Firebase.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        {children}
        <Toaster richColors position="bottom-right" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('wisher-theme');var s=t||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark', s==='dark')}catch{}})()` }} />
      </body>
    </html>
  );
}
