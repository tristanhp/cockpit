import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Nav } from "@/components/nav";
import { CommandPalette } from "@/components/command-palette";
import { AutoSync } from "@/components/auto-sync";
import { CaptureDialog } from "@/components/capture-dialog";
import { Toaster } from "@/components/feedback";
import { KeyboardLayer } from "@/components/keyboard-layer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Cockpit",
  description: "Le tableau de bord de ta vie : vision, projets, tâches, agenda et revues au même endroit.",
};

export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="min-h-full md:flex">
        <Nav demo={process.env.COCKPIT_DEMO === "1"} />
        <main className="min-w-0 flex-1 pb-24 md:px-6 md:py-6 md:pb-6">
          {/* The page: a notebook sheet with its red margin line (desktop). */}
          <div className="relative mx-auto min-h-full max-w-6xl bg-paper md:rounded-sm md:border md:border-rule md:shadow-[0_1px_0_var(--rule),0_18px_40px_-28px_rgba(20,30,60,0.35)]">
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-14 hidden w-px bg-margin/60 md:block" />
            <div className="px-4 py-6 md:py-10 md:pl-24 md:pr-12">{children}</div>
          </div>
        </main>
        <CommandPalette />
        <CaptureDialog />
        <KeyboardLayer />
        <AutoSync />
        <Toaster />
      </body>
    </html>
  );
}
