import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealScout — Verified Gaming Deals",
  description: "Find brand-new gaming tech at or below official MSRP, including verified discounts and retailer promo codes.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
