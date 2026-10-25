import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";

export default function SSOCallbackScreen() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      const timer = setTimeout(() => {
        router.replace("/");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <AuthenticateWithRedirectCallback
          signInForceRedirectUrl="/"
          signUpForceRedirectUrl="/"
          continueSignUpUrl="/"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        />
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
});
