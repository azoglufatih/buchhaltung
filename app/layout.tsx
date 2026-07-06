import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buchhaltung Overview",
  description: "Local expense overview for accounting"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
