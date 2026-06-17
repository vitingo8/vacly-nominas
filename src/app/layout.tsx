import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { EmbeddedModeSync } from "@/components/embedded-mode-sync";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vacly Nóminas - Sistema Inteligente de Gestión",
  description: "Procesamiento inteligente de nóminas con IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </head>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <EmbeddedModeSync />
        {children}
      </body>
    </html>
  );
}
