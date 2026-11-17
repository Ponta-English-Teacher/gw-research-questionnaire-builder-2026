import "./../styles/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthGate from "@/components/AuthGate";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "GW Research Questionnaire Builder 2026",
  description: "AI-assisted research questionnaire design, from introduction to Google Forms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
