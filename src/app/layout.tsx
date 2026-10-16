import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://pharma-evidence.vercel.app"),
  title: "PharmaEvidence — Every claim, backed by evidence",
  description:
    "A pharmaceutical evidence-review workbench. Inspect claims, trace source passages and understand the impact of real label changes. Local neural inference, transparent evaluation and human review.",
  openGraph: {
    title: "PharmaEvidence",
    description: "Every claim. Backed by evidence.",
    type: "website",
  },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123a36",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
