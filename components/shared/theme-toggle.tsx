"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    const htmlAttr = document.documentElement.getAttribute("data-theme") as "dark" | "light" | null;
    const resolved = saved ?? htmlAttr ?? "dark";
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  function toggle() {
    const current = theme ?? "dark";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      suppressHydrationWarning
      className="relative h-8 w-14 rounded-full transition-all flex items-center px-1"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div
        suppressHydrationWarning
        className="absolute h-6 w-6 rounded-full flex items-center justify-center transition-transform"
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-primary-fg)",
          transform: (theme ?? "dark") === "dark" ? "translateX(0)" : "translateX(24px)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {theme === "dark" && <Moon className="w-3 h-3" />}
        {theme === "light" && <Sun className="w-3 h-3" />}
      </div>
    </button>
  );
}
