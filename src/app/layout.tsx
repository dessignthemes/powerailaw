import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./warm.css";
import "./dark.css";
import ScrollLock from "@/components/ScrollLock";

// One font everywhere: Inter (headings, text and numbers).
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LawPower AI — All-in-One AI Automation Workspace for Lawyers",
  description:
    "Client intake, matter review, time tracking, e-signatures, secure file sharing and a client portal, with AI agents that work across all of it. Built by lawyers, for lawyers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Colour scheme (warm beige unless "cool" was chosen) and dark mode (dashboard pages only) before the first paint, so nothing flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;d.dataset.palette=localStorage.getItem('lp-palette')==='cool'?'cool':'warm';if(location.pathname.indexOf('/dashboard')===0&&localStorage.getItem('lp-theme')==='dark')d.dataset.theme='dark'}catch(e){document.documentElement.dataset.palette='warm'}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-ink font-body">
        {children}
        <ScrollLock />
      </body>
    </html>
  );
}
