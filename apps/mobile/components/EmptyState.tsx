import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/store/theme-context";
import { Fonts } from "@/constants/theme";

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

export function EmptyState({
  title = "No messages yet",
  subtitle = "Start the conversation by sending a message below!",
}: EmptyStateProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: isDark ? colors.surfaceElevated : "#EFF6FF",
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={styles.iconText}>💬</Text>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
  },
  iconText: {
    fontSize: 28,
  },
  title: {
    fontSize: 18,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
