import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealScout — Resale Deal Intelligence",
  description: "Track new, sealed products at MSRP or below with verified stock, pricing, and resale profit estimates.",
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
