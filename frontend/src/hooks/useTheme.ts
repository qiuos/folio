import { useState, useEffect } from "react"

type Theme = "dark" | "light" | "system"

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("folio-theme") as Theme
    return stored || "dark"
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light")

    const resolved =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : theme

    if (resolved === "light") {
      root.classList.add("light")
    }

    localStorage.setItem("folio-theme", theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)

  return { theme, setTheme }
}
