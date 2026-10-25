import React, { createContext, useContext, useEffect, useState } from "react";
import {
  type ThemeMode,
  type ThemeColors,
  lightColors,
  darkColors,
  getThemeColors,
  setActiveColors,
} from "@/constants/theme";
import { getStoredItem, setStoredItem } from "@/services/storage";

interface ThemeContextValue {
  theme: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY_THEME = "chatapp_theme_mode";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [colors, setColors] = useState<ThemeColors>(lightColors);

  // Load saved theme on startup
  useEffect(() => {
    let isMounted = true;
    async function loadTheme() {
      try {
        const saved = await getStoredItem(STORAGE_KEY_THEME);
        if (!isMounted) return;
        if (saved === "dark" || saved === "light") {
          setThemeState(saved);
          const nextColors = getThemeColors(saved);
          setColors(nextColors);
          setActiveColors(nextColors);
        }
      } catch (err) {
        console.warn("[Theme] Failed to load stored theme:", err);
      }
    }
    void loadTheme();
    return () => {
      isMounted = false;
    };
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    const nextColors = getThemeColors(mode);
    setColors(nextColors);
    setActiveColors(nextColors);
    void setStoredItem(STORAGE_KEY_THEME, mode);
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        colors,
        isDark: theme === "dark",
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback if accessed outside ThemeProvider
    return {
      theme: "light",
      colors: lightColors,
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return context;
}
