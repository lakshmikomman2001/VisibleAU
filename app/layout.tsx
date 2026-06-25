import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisibleAU",
  description: "AI search visibility platform for Australian businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" translate="no" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
