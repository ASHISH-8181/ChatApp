import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { AuthenticateWithRedirectCallback } from "@clerk/react";

export default function SSOCallbackScreen() {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
});
