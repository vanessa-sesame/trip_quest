import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito_Sans, Short_Stack } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Same two families the printable PDF uses (app/lib/pdf/booklet-pdf.ts's FONT_ASSETS)
// so the on-screen preview and the printed booklet read as the same object,
// not two different designs.
const displayFont = Short_Stack({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const bodyFont = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const title = "TripQuest Kids";
const description =
  "Create thoughtful travel adventures tailored to a child's age, destination, and trip length.";

export function generateMetadata(): Metadata {
  // Link previews need an absolute URL; the 1200x630 JPEG stays small
  // enough for chat apps that skip large preview images.
  const socialImage = "https://tripquestkids.com/og.jpg";

  return {
    title,
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "TripQuest Kids illustrated destination activities",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${bodyFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
