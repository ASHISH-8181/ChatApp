import React from "react";
import { StyleSheet, Platform, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@/components/Icon";
import { Colors, getFloatingTabBarStyle } from "@/constants/theme";
import { useDecoyLock } from "@/store/decoy-lock-context";
import { useTheme } from "@/store/theme-context";
import { GlobalNotificationToast } from "@/components/GlobalNotificationToast";

export default function TabLayout() {
  const { isLocked } = useDecoyLock();
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: getFloatingTabBarStyle(colors, isDark, isLocked),
          tabBarItemStyle: styles.tabBarItem,
        }}
      >
        <Tabs.Screen
          name="chats"
          options={{
            title: "Chats",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "chatbubbles" : "chatbubbles-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: "Groups",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="games"
          options={{
            title: "Games",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "game-controller" : "game-controller-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={24}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
      <GlobalNotificationToast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: Platform.OS === "ios" ? 26 : 20,
    backgroundColor: Colors.card,
    borderRadius: 32,
    borderWidth: 1,
    borderTopWidth: 1,
    height: Platform.OS === "ios" ? 64 : 58,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    elevation: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  tabBarItem: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
});
