import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "@/store/user-context";
import {
  fetchHealth,
  registerUserProfile,
  loginUser,
  getServerUrl,
} from "@/services/api";
import { Fonts, Colors } from "@/constants/theme";

type AuthMode = "register" | "login";


export default function EntryScreen() {
  const { currentUser, setCurrentUser, serverUrl, updateServerUrl } = useUser();

  React.useEffect(() => {
    if (currentUser) {
      router.replace("/(tabs)/chats");
    }
  }, [currentUser]);

  const initialUrl = React.useMemo(() => {
    const resolved = getServerUrl();
    if (Platform.OS === "android" && (serverUrl.includes("localhost") || serverUrl.includes("127.0.0.1"))) {
      return resolved;
    }
    return serverUrl;
  }, [serverUrl]);

  const [mode, setMode] = useState<AuthMode>("register");

  // Registration fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Login field
  const [loginIdentifier, setLoginIdentifier] = useState("");

  // Server & error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState(initialUrl);
  const [showSettings, setShowSettings] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverCheckResult, setServerCheckResult] = useState<string | null>(null);

  const getInitial = () => {
    const trimmed = (mode === "register" ? name : loginIdentifier).trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : "💬";
  };

  const handleTestConnection = async () => {
    try {
      setCheckingServer(true);
      setServerCheckResult(null);
      updateServerUrl(customUrl);
      const res = await fetchHealth();
      setServerCheckResult(`Connected to ${res.service}`);
    } catch (err: any) {
      setServerCheckResult(`Failed: ${err.message || "Cannot reach server"}`);
    } finally {
      setCheckingServer(false);
    }
  };

  const handleRegister = async () => {
    setError(null);

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
    const cleanPhone = phoneNumber.trim();

    if (!cleanName || cleanName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      setError("Please enter a username (at least 3 characters).");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 7) {
      setError("Please enter a valid phone number (at least 7 digits).");
      return;
    }

    try {
      setLoading(true);
      updateServerUrl(customUrl);

      const user = await registerUserProfile({
        name: cleanName,
        username: cleanUsername,
        phoneNumber: cleanPhone,
      });

      setCurrentUser(user);
      router.replace("/(tabs)/chats");
    } catch (err: any) {
      setError(err.message || "Failed to create profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    const cleanId = loginIdentifier.trim();

    if (!cleanId) {
      setError("Please enter your username or phone number.");
      return;
    }

    try {
      setLoading(true);
      updateServerUrl(customUrl);

      const user = await loginUser(cleanId);
      setCurrentUser(user);
      router.replace("/(tabs)/chats");
    } catch (err: any) {
      setError(err.message || "User not found. Check your username or phone number.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>💬</Text>
            </View>
            <Text style={styles.appTitle}>ChatApp</Text>
            <Text style={styles.appSubtitle}>Real-Time Mobile Messaging</Text>
          </View>

          {/* Main Card */}
          <View style={styles.card}>
            {/* Mode Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, mode === "register" && styles.activeTab]}
                onPress={() => {
                  setMode("register");
                  setError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === "register" && styles.activeTabText,
                  ]}
                >
                  Create Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, mode === "login" && styles.activeTab]}
                onPress={() => {
                  setMode("login");
                  setError(null);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === "login" && styles.activeTabText,
                  ]}
                >
                  Sign In
                </Text>
              </TouchableOpacity>
            </View>

            {/* Avatar Preview */}
            <View style={styles.avatarPreviewContainer}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>{getInitial()}</Text>
              </View>
              <Text style={styles.avatarLabel}>
                {mode === "register"
                  ? name.trim()
                    ? `${name.trim()} (${username.trim() ? `@${username.trim()}` : "setting username"})`
                    : "Live Profile Preview"
                  : loginIdentifier.trim()
                  ? `Signing in as ${loginIdentifier.trim()}`
                  : "Enter your registered identifier"}
              </Text>
            </View>

            {/* Error Message Box */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>⚠️ {error}</Text>
              </View>
            )}

            {/* Register Form */}
            {mode === "register" ? (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Sarah Connor"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={(val) => {
                      setName(val);
                      if (error) setError(null);
                    }}
                    autoCapitalize="words"
                    maxLength={50}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Unique Username</Text>
                    <Text style={styles.labelHint}>Must be unique</Text>
                  </View>
                  <View style={styles.inputWithPrefix}>
                    <Text style={styles.inputPrefix}>@</Text>
                    <TextInput
                      style={styles.inputPrefixed}
                      placeholder="sconnor"
                      placeholderTextColor="#9CA3AF"
                      value={username}
                      onChangeText={(val) => {
                        setUsername(val);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={30}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Phone Number</Text>
                    <Text style={styles.labelHint}>Must be unique</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="+1 555-0199"
                    placeholderTextColor="#9CA3AF"
                    value={phoneNumber}
                    onChangeText={(val) => {
                      setPhoneNumber(val);
                      if (error) setError(null);
                    }}
                    keyboardType="phone-pad"
                    maxLength={20}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleRegister}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Create Profile & Enter Chat
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              /* Sign In Form */
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Username or Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. @sconnor or +1 555-0199"
                    placeholderTextColor="#9CA3AF"
                    value={loginIdentifier}
                    onChangeText={(val) => {
                      setLoginIdentifier(val);
                      if (error) setError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={handleLogin}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Sign In to Chat
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Server Settings Accordion */}
            <TouchableOpacity
              style={styles.settingsToggle}
              onPress={() => setShowSettings(!showSettings)}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsToggleText}>
                {showSettings ? "▲ Hide Server Configuration" : "⚙️ Server Configuration"}
              </Text>
            </TouchableOpacity>

            {showSettings && (
              <View style={styles.settingsPanel}>
                <Text style={styles.settingsLabel}>Backend API & Socket URL</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={customUrl}
                  onChangeText={setCustomUrl}
                  placeholder="http://localhost:3000"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.settingsRow}>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestConnection}
                    disabled={checkingServer}
                  >
                    {checkingServer ? (
                      <ActivityIndicator size="small" color="#2563EB" />
                    ) : (
                      <Text style={styles.testButtonText}>Test Connection</Text>
                    )}
                  </TouchableOpacity>
                  {serverCheckResult && (
                    <Text
                      style={[
                        styles.testResultText,
                        serverCheckResult.startsWith("Connected")
                          ? styles.testResultSuccess
                          : styles.testResultError,
                      ]}
                      numberOfLines={1}
                    >
                      {serverCheckResult}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Footer note */}
          <Text style={styles.footerText}>
            ChatApp • Profile Persistence in PostgreSQL with Prisma ORM
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  logoIcon: {
    fontSize: 28,
  },
  appTitle: {
    fontSize: 28,
    fontFamily: Fonts.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
  },
  appSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: Colors.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  activeTabText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  avatarPreviewContainer: {
    alignItems: "center",
    marginVertical: 12,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInitial: {
    fontSize: 26,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  avatarLabel: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  errorBoxText: {
    color: Colors.danger,
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
  },
  form: {
    marginTop: 10,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 11,
    color: Colors.primary,
    fontFamily: Fonts.semiBold,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  inputWithPrefix: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputPrefix: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textMuted,
    marginRight: 4,
  },
  inputPrefixed: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonDisabled: {
    backgroundColor: "#93C5FD",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  settingsToggle: {
    marginTop: 18,
    alignItems: "center",
    paddingVertical: 4,
  },
  settingsToggleText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  settingsPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  settingsLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  settingsInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  testButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  testButtonText: {
    fontSize: 12,
    color: Colors.primary,
    fontFamily: Fonts.semiBold,
  },
  testResultText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    flex: 1,
  },
  testResultSuccess: {
    color: Colors.success,
  },
  testResultError: {
    color: Colors.danger,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyMedium,
    textAlign: "center",
    marginTop: 20,
    maxWidth: 320,
  },
});

