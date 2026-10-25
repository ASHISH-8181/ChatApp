import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@/components/Icon";
import { useTheme } from "@/store/theme-context";

export function ThemeNavButton() {
  const { toggleTheme, isDark } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
      ]}
      onPress={toggleTheme}
      activeOpacity={0.75}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={`Switch to ${isDark ? "Light" : "Dark"} theme`}
    >
      <View style={styles.iconBox}>
        <Ionicons
          name={isDark ? "sunny" : "moon"}
          size={17}
          color={isDark ? "#FBBF24" : "#5B50E6"}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  btnLight: {
    backgroundColor: "#EEF0FF",
    borderColor: "#DDD6FE",
  },
  btnDark: {
    backgroundColor: "#171F33",
    borderColor: "#253150",
  },
  iconBox: {
    justifyContent: "center",
    alignItems: "center",
  },
});
