"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/lib/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale() {
    const next = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
    router.replace(pathname, { locale: next });
  }

  return (
    <button
      aria-label="Switch language"
      className={className}
      onClick={switchLocale}
      type="button"
    >
      {locale === "en" ? "ES" : "EN"}
    </button>
  );
}
