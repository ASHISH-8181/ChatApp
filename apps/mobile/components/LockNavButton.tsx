import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@/components/Icon";
import { useDecoyLock } from "@/store/decoy-lock-context";
import { useTheme } from "@/store/theme-context";

interface LockNavButtonProps {
  compact?: boolean;
}

export function LockNavButton({ compact = true }: LockNavButtonProps) {
  const { openSetupModal, pin } = useDecoyLock();
  const { isDark } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
        compact ? styles.btnCompact : styles.btnExpanded,
      ]}
      onPress={openSetupModal}
      activeOpacity={0.75}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel="Decoy Lock Settings"
    >
      <View style={styles.iconBox}>
        <Ionicons
          name="lock-closed"
          size={compact ? 16 : 14}
          color={isDark ? "#A78BFA" : "#6D28D9"}
        />
      </View>
      {!compact && (
        <Text style={[styles.btnText, { color: isDark ? "#DDD6FE" : "#6D28D9" }]}>
          Lock
        </Text>
      )}
      {pin && <View style={styles.indicatorDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  btnLight: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  btnDark: {
    backgroundColor: "#171F33",
    borderColor: "#253150",
  },
  btnCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  btnExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  iconBox: {
    justifyContent: "center",
    alignItems: "center",
  },
  btnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  indicatorDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
