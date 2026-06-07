"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const storageKey = "wcpolling-font-scale";

type Scale = "normal" | "large" | "xlarge";

const SCALES: { value: Scale; size: number }[] = [
  { value: "normal", size: 12 },
  { value: "large", size: 15 },
  { value: "xlarge", size: 18 },
];

function getStoredScale(): Scale {
  if (typeof window === "undefined") return "normal";
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "large" || stored === "xlarge" || stored === "normal") return stored;
  return "normal";
}

function applyScale(scale: Scale) {
  if (scale === "normal") {
    delete document.documentElement.dataset.fontScale;
  } else {
    document.documentElement.dataset.fontScale = scale;
  }
}

export function FontSizeInitializer() {
  useEffect(() => {
    applyScale(getStoredScale());
  }, []);

  return null;
}

export function FontSizeControl({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const t = useTranslations("userMenu");
  const [scale, setScale] = useState<Scale | null>(null);

  useEffect(() => {
    const resolved = getStoredScale();
    setScale(resolved);
    applyScale(resolved);
  }, []);

  function choose(next: Scale) {
    setScale(next);
    window.localStorage.setItem(storageKey, next);
    applyScale(next);
  }

  return (
    <div
      className={className}
      role="group"
      aria-label={t("textSize")}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, ...style }}
    >
      <span className="text-sm font-semibold">{t("textSize")}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {SCALES.map(({ value, size }) => {
          const active = scale === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={active}
              aria-label={t(`textSize_${value}`)}
              suppressHydrationWarning
              style={{
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                fontWeight: 800,
                fontSize: size,
                borderRadius: 10,
                cursor: "pointer",
                border: `1px solid ${active ? "var(--accent-strong)" : "var(--border)"}`,
                background: active ? "var(--accent-soft)" : "var(--bg-strong)",
                color: active ? "var(--accent-ink)" : "var(--ink)",
              }}
            >
              A
            </button>
          );
        })}
      </div>
    </div>
  );
}
