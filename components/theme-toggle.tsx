"use client";

import { useEffect } from "react";
import { useState } from "react";

const storageKey = "wcpolling-theme";

function getPreferredTheme() {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem(storageKey);
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeInitializer() {
  useEffect(() => {
    const preferredTheme = getPreferredTheme() as "light" | "dark";
    applyTheme(preferredTheme);
  }, []);

  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => getPreferredTheme() as "light" | "dark");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={className}
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
