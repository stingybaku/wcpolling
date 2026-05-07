import type { Metadata } from "next";
import { Bebas_Neue, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ThemeInitializer } from "@/components/theme-toggle";
import "../globals.css";

const displayFont = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
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
      <body className={`${displayFont.variable} ${bodyFont.variable} app-body`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeInitializer />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
