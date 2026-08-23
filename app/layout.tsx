import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Ratroo — Know the way. Enjoy the ride.";
  const description = "Plan dependable public transport journeys across India. No login required.";
  const image = new URL("/og.png", origin).toString();

  return {
    title,
    description,
    icons: { icon: "/ratroo-icon.png", shortcut: "/ratroo-icon.png", apple: "/ratroo-icon.png" },
    openGraph: { title, description, type: "website", url: origin, images: [{ url: image, width: 1200, height: 630, alt: "Ratroo — Know the way. Enjoy the ride." }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
