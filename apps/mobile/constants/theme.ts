export const Fonts = {
  regular: "PlusJakartaSans-Regular",
  medium: "PlusJakartaSans-Medium",
  semiBold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
  extraBold: "PlusJakartaSans-ExtraBold",
  bodyRegular: "Inter-Regular",
  bodyMedium: "Inter-Medium",
  bodySemiBold: "Inter-SemiBold",
  bodyBold: "Inter-Bold",
};

export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  isDark: boolean;
  // Core Brand
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryGlow: string;
  secondary: string;
  secondaryLight: string;
  accentPurple: string;
  accentPurpleLight: string;
  accentCrimson: string;
  accentCrimsonLight: string;
  // Status
  success: string;
  successLight: string;
  successGlow: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  // Surfaces & Backgrounds
  background: string;
  backgroundSecondary: string;
  card: string;
  cardHover: string;
  surfaceElevated: string;
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Dividers & Borders
  border: string;
  borderLight: string;
  // Chat Specific
  bubbleSent: string;
  bubbleSentText: string;
  bubbleReceived: string;
  bubbleReceivedText: string;
  bubbleReceivedBorder: string;
  inputBackground: string;
  inputBorder: string;
  unreadBadge: string;
  activeFilterChip: string;
  activeFilterText: string;
}

export const lightColors: ThemeColors = {
  isDark: false,
  // Modern Lume Indigo Brand
  primary: "#5B50E6",
  primaryHover: "#4A3FD4",
  primaryLight: "#EEF0FF",
  primaryGlow: "rgba(91, 80, 230, 0.15)",
  secondary: "#6366F1",
  secondaryLight: "#F5F6FF",
  accentPurple: "#7C3AED",
  accentPurpleLight: "#FAF5FF",
  accentCrimson: "#E11D48",
  accentCrimsonLight: "#FFF1F2",
  // Status
  success: "#10B981",
  successLight: "#ECFDF5",
  successGlow: "rgba(16, 185, 129, 0.2)",
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  // Clean Crisp Light Surfaces
  background: "#F8FAFD",
  backgroundSecondary: "#EEF2F7",
  card: "#FFFFFF",
  cardHover: "#F6F8FB",
  surfaceElevated: "#FFFFFF",
  // High contrast slate typography
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#8E9BB2",
  // Borders
  border: "#E5EBF4",
  borderLight: "#EFF3F8",
  // Chat Specific
  bubbleSent: "#5B50E6",
  bubbleSentText: "#FFFFFF",
  bubbleReceived: "#FFFFFF",
  bubbleReceivedText: "#0F172A",
  bubbleReceivedBorder: "#E5EBF4",
  inputBackground: "#F1F5F9",
  inputBorder: "#E2E8F0",
  unreadBadge: "#5B50E6",
  activeFilterChip: "#5B50E6",
  activeFilterText: "#FFFFFF",
};

export const darkColors: ThemeColors = {
  isDark: true,
  // Modern Lume Midnight Electric Indigo Brand
  primary: "#6366F1",
  primaryHover: "#7579FF",
  primaryLight: "rgba(99, 102, 241, 0.18)",
  primaryGlow: "rgba(99, 102, 241, 0.28)",
  secondary: "#818CF8",
  secondaryLight: "rgba(129, 140, 248, 0.14)",
  accentPurple: "#8B5CF6",
  accentPurpleLight: "rgba(139, 92, 246, 0.16)",
  accentCrimson: "#FB7185",
  accentCrimsonLight: "rgba(251, 113, 133, 0.16)",
  // Status
  success: "#10B981",
  successLight: "rgba(16, 185, 129, 0.16)",
  successGlow: "rgba(16, 185, 129, 0.3)",
  danger: "#F87171",
  dangerLight: "rgba(248, 113, 113, 0.16)",
  warning: "#FBBF24",
  warningLight: "rgba(251, 191, 36, 0.16)",
  // Deep Obsidian Surfaces
  background: "#090C15",
  backgroundSecondary: "#0F1424",
  card: "#131929",
  cardHover: "#1A2237",
  surfaceElevated: "#171E32",
  // Bright readable typography
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  // Borders
  border: "#1E273E",
  borderLight: "#161E31",
  // Chat Specific
  bubbleSent: "#5B50E6",
  bubbleSentText: "#FFFFFF",
  bubbleReceived: "#171E32",
  bubbleReceivedText: "#F8FAFC",
  bubbleReceivedBorder: "#222D47",
  inputBackground: "#131929",
  inputBorder: "#202A42",
  unreadBadge: "#6366F1",
  activeFilterChip: "#6366F1",
  activeFilterText: "#FFFFFF",
};

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === "dark" ? darkColors : lightColors;
}

// Current active color reference for backwards compatibility
export let Colors: ThemeColors = lightColors;

export function setActiveColors(colors: ThemeColors) {
  Colors = colors;
}

import { Platform } from "react-native";

export function getFloatingTabBarStyle(
  colors: ThemeColors,
  isDark: boolean,
  isHidden: boolean = false
) {
  if (isHidden) {
    return { display: "none" as const };
  }
  return {
    position: "absolute" as const,
    left: 18,
    right: 18,
    bottom: Platform.OS === "ios" ? 26 : 20,
    backgroundColor: colors.card,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.12)" : colors.border,
    borderTopColor: isDark ? "rgba(255,255,255,0.12)" : colors.border,
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 64 : 58,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-around" as const,
    elevation: 14,
    shadowColor: isDark ? "#000000" : "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 18,
  };
}
