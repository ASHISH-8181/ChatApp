import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ConnectionStatus } from "@/services/socket";
import { useTheme } from "@/store/theme-context";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  showText?: boolean;
}

export function ConnectionBadge({ status, showText = true }: ConnectionBadgeProps) {
  const { isDark } = useTheme();

  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          label: "Connected",
          desc: "Connected to live chat server",
          dotColor: "#10B981",
          bgColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5",
          textColor: isDark ? "#34D399" : "#065F46",
          borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0",
        };
      case "connecting":
        return {
          label: "Connecting...",
          desc: "Connecting to live chat server...",
          dotColor: "#F59E0B",
          bgColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FFFBEB",
          textColor: isDark ? "#FBBF24" : "#92400E",
          borderColor: isDark ? "rgba(245, 158, 11, 0.3)" : "#FDE68A",
        };
      case "error":
        return {
          label: "Connection Error",
          desc: "Unable to reach chat server. Reconnecting...",
          dotColor: "#EF4444",
          bgColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#FEF2F2",
          textColor: isDark ? "#F87171" : "#991B1B",
          borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#FECACA",
        };
      case "disconnected":
      default:
        return {
          label: "Offline",
          desc: "Chat server is offline.",
          dotColor: isDark ? "#64748B" : "#94A3B8",
          bgColor: isDark ? "#171F33" : "#F1F5F9",
          textColor: isDark ? "#94A3B8" : "#475569",
          borderColor: isDark ? "#253150" : "#E2E8F0",
        };
    }
  };

  const config = getStatusConfig();

  const handlePress = () => {
    if (!showText) {
      Alert.alert("Server Status", config.desc);
    }
  };

  return (
    <TouchableOpacity
      style={[
        showText ? styles.container : styles.containerCompact,
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
      ]}
      onPress={handlePress}
      activeOpacity={showText ? 1 : 0.75}
      accessibilityLabel={`Connection Status: ${config.label}`}
    >
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      {showText && (
        <Text style={[styles.text, { color: config.textColor }]}>
          {config.label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
  },
  containerCompact: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
