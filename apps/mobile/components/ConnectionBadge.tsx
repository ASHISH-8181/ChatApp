import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ConnectionStatus } from "@/services/socket";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  showText?: boolean;
}

export function ConnectionBadge({ status, showText = true }: ConnectionBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          label: "Connected",
          dotColor: "#10B981",
          bgColor: "#ECFDF5",
          textColor: "#065F46",
          borderColor: "#A7F3D0",
        };
      case "connecting":
        return {
          label: "Connecting...",
          dotColor: "#F59E0B",
          bgColor: "#FFFBEB",
          textColor: "#92400E",
          borderColor: "#FDE68A",
        };
      case "error":
        return {
          label: "Connection Error",
          dotColor: "#EF4444",
          bgColor: "#FEF2F2",
          textColor: "#991B1B",
          borderColor: "#FECACA",
        };
      case "disconnected":
      default:
        return {
          label: "Offline",
          dotColor: "#94A3B8",
          bgColor: "#F1F5F9",
          textColor: "#475569",
          borderColor: "#E2E8F0",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      {showText && (
        <Text style={[styles.text, { color: config.textColor }]}>
          {config.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
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
