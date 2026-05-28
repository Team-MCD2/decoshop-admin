import type { Metadata } from "next";
import { DM_Sans, Playfair_Display, Tajawal } from "next/font/google";
import "./globals.css";
import PwaRegistration from "./PwaRegistration";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DecoShop — Espace Livraisons & Administration",
  description: "Plateforme unifiée de suivi des commandes Shopify et de gestion des livraisons PWA.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/logo.svg",
    shortcut: "/icons/logo.svg",
    apple: "/icons/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${dmSans.variable} ${playfairDisplay.variable} ${tajawal.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
