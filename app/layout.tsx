import type { Metadata } from "next";
import { DM_Sans, Spectral } from "next/font/google";
import { AppProvider } from "@/lib/appStore";
import "./globals.css";

// Typsnitten hämtas vid bygget och serveras från vår egen domän.
// Ingen förfrågan går till Google från besökarens webbläsare.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-dm-sans",
});

// Spectral används bara kursivt, för enstaka betonade ord (klassen .serif).
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["italic"],
  display: "swap",
  variable: "--font-spectral",
});

export const metadata: Metadata = {
  title: "Kyrkans uppdragsapp",
  description: "Volontärhantering för kyrkan",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${dmSans.variable} ${spectral.variable}`}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
