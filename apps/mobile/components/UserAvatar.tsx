import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/store/theme-context";

export const AVATAR_PALETTE_COLORS = [
  "#2563EB", // Blue
  "#7C3AED", // Purple
  "#059669", // Emerald
  "#D97706", // Amber
  "#DC2626", // Red
  "#0891B2", // Cyan
  "#4F46E5", // Indigo
  "#DB2777", // Pink
  "#0D9488", // Teal
  "#EA580C", // Orange
];

export function getAvatarColor(seed: string): string {
  if (!seed) return AVATAR_PALETTE_COLORS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE_COLORS.length;
  return AVATAR_PALETTE_COLORS[index];
}

export interface UserAvatarProps {
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  size?: number;
  fontSize?: number;
  backgroundColor?: string;
  showOnlineDot?: boolean;
  isOnline?: boolean;
  isChugli?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function UserAvatar({
  name,
  username,
  avatarUrl,
  size = 40,
  fontSize,
  backgroundColor,
  showOnlineDot = false,
  isOnline = false,
  isChugli = false,
  style,
  imageStyle,
}: UserAvatarProps) {
  const { colors } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const cleanName = (name || "").trim();
  const cleanUsername = (username || "").replace(/^@/, "").trim();
  const initial = (cleanName || cleanUsername || "?").charAt(0).toUpperCase() || "?";

  const resolvedBgColor = isChugli
    ? "#8B5CF6"
    : backgroundColor || getAvatarColor(cleanUsername || cleanName || "user");

  const computedFontSize = fontSize || Math.max(10, Math.round(size * 0.42));
  const dotSize = Math.max(8, Math.round(size * 0.28));

  const hasValidImage = Boolean(
    avatarUrl && avatarUrl.trim() && avatarUrl !== failedUrl && !isChugli
  );

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      {hasValidImage ? (
        <Image
          source={{ uri: avatarUrl! }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
            imageStyle,
          ]}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUrl(avatarUrl || null)}
        />
      ) : (
        <View
          style={[
            styles.fallbackContainer,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: resolvedBgColor,
            },
          ]}
        >
          <Text
            style={[
              styles.initialText,
              {
                fontSize: computedFontSize,
                lineHeight: computedFontSize * 1.2,
              },
            ]}
          >
            {initial}
          </Text>
        </View>
      )}

      {showOnlineDot && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: isOnline ? "#10B981" : "#94A3B8",
              borderWidth: Math.max(1.5, Math.round(size * 0.05)),
              borderColor: colors.card,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    backgroundColor: "#E2E8F0",
  },
  fallbackContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: {
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
    includeFontPadding: false,
  },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    borderColor: "#FFFFFF",
  },
});
