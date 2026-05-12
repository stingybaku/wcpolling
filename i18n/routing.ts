import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  domains: [
    {
      domain: "mundial.julioordonez.co",
      defaultLocale: "es",
      locales: ["en", "es"],
    },
  ],
});
