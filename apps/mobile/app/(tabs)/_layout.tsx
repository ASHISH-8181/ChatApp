import React from "react";
import { StyleSheet, Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";
import { useDecoyLock } from "@/store/decoy-lock-context";

import { useTheme } from "@/store/theme-context";

export default function TabLayout() {
  const { isLocked } = useDecoyLock();
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: isLocked
          ? { display: "none" }
          : [
              styles.tabBar,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                shadowColor: isDark ? "#000000" : "#0F172A",
                shadowOpacity: isDark ? 0.25 : 0.05,
              },
            ],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarLabel: "Chats",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarLabel: "Groups",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarLabel: "Games",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "game-controller" : "game-controller-outline"}
              size={23}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={23}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: Platform.OS === "ios" ? 88 : 64,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 10,
    elevation: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  tabBarLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  tabBarItem: {
    paddingVertical: 2,
  },
});

