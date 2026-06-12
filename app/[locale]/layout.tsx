import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeInitializer } from "@/components/theme-toggle";
import { FontSizeInitializer } from "@/components/font-size-control";
import { SessionProvider } from "@/components/session-provider";
import { LocalePersister } from "@/components/locale-persister";
import "../globals.css";

// Manrope — display / headlines / KPI numbers
const displayFont = Manrope({
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

// Inter — body copy / UI labels
const bodyFont = Inter({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

// JetBrains Mono — scores, points, codes, eyebrows
const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "World Cup 2026 Predictions",
  description: "Create predictions and score your World Cup picks.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} app-body`}>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <ThemeInitializer />
            <FontSizeInitializer />
            <LocalePersister />
            {children}
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
