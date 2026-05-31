import type { Metadata } from "next";
import { AppProvider } from "@/lib/appStore";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kyrkans uppdragsapp",
  description: "Volontärhantering för kyrkan",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
