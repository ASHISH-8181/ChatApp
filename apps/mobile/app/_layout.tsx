import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { Platform } from "react-native";
import { ClerkProvider } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import { UserProvider } from "@/store/user-context";
import { DecoyLockProvider } from "@/store/decoy-lock-context";
import { GlobalDecoyLockView } from "@/components/GlobalDecoyLockView";
import { tokenCache } from "@/services/tokenCache";
import { ThemeProvider, useTheme } from "@/store/theme-context";
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";

WebBrowser.maybeCompleteAuthSession();

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_cmVsYXhpbmctZmFsY29uLTUzNjIuY2xlcmsuYWNjb3VudHMuZGV2JA";

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default;
    const isExpoGo =
      Constants?.appOwnership === "expo" ||
      Constants?.executionEnvironment === "storeClient";

    // WebRTC native modules are bundled in custom development builds, not Expo Go
    if (!isExpoGo) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { registerGlobals } = require("@livekit/react-native");
      registerGlobals();
    }
  } catch (e: any) {
    if (!e?.message?.includes("WebRTC native module not found")) {
      console.warn("[LiveKit] registerGlobals error:", e);
    }
  }
}

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigation() {
  const { colors, isDark } = useTheme();

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.textPrimary,
      border: isDark ? "rgba(255,255,255,0.12)" : colors.border,
      notification: colors.danger,
    },
    fonts: isDark ? DarkTheme.fonts : DefaultTheme.fonts,
  };

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontFamily: "PlusJakartaSans-Bold",
            fontWeight: "700",
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "ChatApp",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="chat"
          options={{
            title: "Chat",
            headerShown: false,
          }}
        />
      </Stack>
      <GlobalDecoyLockView />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "PlusJakartaSans-Regular": PlusJakartaSans_400Regular,
    "PlusJakartaSans-Medium": PlusJakartaSans_500Medium,
    "PlusJakartaSans-SemiBold": PlusJakartaSans_600SemiBold,
    "PlusJakartaSans-Bold": PlusJakartaSans_700Bold,
    "PlusJakartaSans-ExtraBold": PlusJakartaSans_800ExtraBold,
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={Platform.OS !== "web" ? tokenCache : undefined}
    >
      <SafeAreaProvider>
        <ThemeProvider>
          <UserProvider>
            <DecoyLockProvider>
              <RootNavigation />
            </DecoyLockProvider>
          </UserProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
