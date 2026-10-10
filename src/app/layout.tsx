import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// One font everywhere: Inter (headings, text and numbers).
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LawPower AI — All-in-One AI Agents Workspace for Lawyers",
  description:
    "Client intake, matter review, time tracking, e-signatures, secure file sharing and a client portal, with AI agents that work across all of it. Built by lawyers, for lawyers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-ink font-body">
        {children}
      </body>
    </html>
  );
}
