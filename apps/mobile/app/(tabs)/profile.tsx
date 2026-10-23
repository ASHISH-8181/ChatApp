import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from "@/components/Icon";
import { useUser } from "@/store/user-context";
import { socketService } from "@/services/socket";
import { updateUserDisplayName } from "@/services/api";

export default function ProfileScreen() {
  const { currentUser, setCurrentUser, serverUrl } = useUser();

  const [name, setName] = useState(currentUser?.name || "");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notLoggedInContainer}>
          <Text style={styles.notLoggedInText}>No active profile session found.</Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.signInButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isNameChanged = name.trim() !== currentUser.name;

  const handleSaveName = async () => {
    const clean = name.trim();
    if (!clean || clean.length < 2) {
      setErrorMsg("Display name must be at least 2 characters.");
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const updated = await updateUserDisplayName(currentUser.id, clean);
      setCurrentUser(updated);
      setSuccessMsg("Profile name updated successfully!");
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile name.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    const performSignOut = () => {
      socketService.disconnect();
      setCurrentUser(null);
      router.replace("/");
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) performSignOut();
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out of your account?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: performSignOut },
        ]
      );
    }
  };

  const getInitial = () => {
    return currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "?";
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={styles.onlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Active</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar Hero Card */}
          <View style={styles.heroCard}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{getInitial()}</Text>
            </View>
            <Text style={styles.heroName}>{currentUser.name}</Text>
            <Text style={styles.heroUsername}>@{currentUser.username}</Text>

            <View style={styles.badgeRow}>
              <View style={styles.memberBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#2563EB" />
                <Text style={styles.memberBadgeText}>Verified Member</Text>
              </View>
            </View>
          </View>

          {/* Feedback Banners */}
          {successMsg ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color="#166534" />
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#991B1B" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Profile Details Form */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account Credentials</Text>

            {/* Editable Field: Full Name */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Display Name</Text>
                <Text style={styles.fieldHint}>Editable</Text>
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#64748B" style={styles.fieldIcon} />
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                />
              </View>
              {isNameChanged ? (
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={handleSaveName}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.saveButtonText}>Save Display Name</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Locked Field: Username */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Username</Text>
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={12} color="#DC2626" />
                  <Text style={styles.lockedPillText}>Cannot be changed</Text>
                </View>
              </View>
              <View style={[styles.inputWrapper, styles.lockedInputWrapper]}>
                <Ionicons name="at" size={18} color="#94A3B8" style={styles.fieldIcon} />
                <TextInput
                  style={[styles.textInput, styles.lockedTextInput]}
                  value={currentUser.username}
                  editable={false}
                />
                <Ionicons name="lock-closed" size={16} color="#94A3B8" />
              </View>
              <Text style={styles.fieldDisclaimer}>
                Unique usernames cannot be altered once registered.
              </Text>
            </View>

            {/* Locked Field: Phone Number */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Phone Number</Text>
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={12} color="#DC2626" />
                  <Text style={styles.lockedPillText}>Cannot be changed</Text>
                </View>
              </View>
              <View style={[styles.inputWrapper, styles.lockedInputWrapper]}>
                <Ionicons name="call-outline" size={18} color="#94A3B8" style={styles.fieldIcon} />
                <TextInput
                  style={[styles.textInput, styles.lockedTextInput]}
                  value={currentUser.phoneNumber}
                  editable={false}
                />
                <Ionicons name="lock-closed" size={16} color="#94A3B8" />
              </View>
              <Text style={styles.fieldDisclaimer}>
                Your registered phone number is permanently bound to this account.
              </Text>
            </View>
          </View>

          {/* System & Security Info */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account & System Details</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>User ID</Text>
              <Text style={styles.infoValueMono} numberOfLines={1}>
                {currentUser.id}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Server Backend</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {serverUrl}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Security</Text>
              <View style={styles.securityBadge}>
                <Ionicons name="shield-checkmark" size={13} color="#166534" />
                <Text style={styles.securityText}>PostgreSQL + Prisma Verified</Text>
              </View>
            </View>
          </View>

          {/* Sign Out Action */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
            <Text style={styles.signOutButtonText}>Sign Out of ChatApp</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  onlineText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 4,
    borderColor: "#DBEAFE",
  },
  avatarText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  heroUsername: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563EB",
    marginTop: 2,
  },
  badgeRow: {
    marginTop: 12,
  },
  memberBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  memberBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  successText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#166534",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#991B1B",
    flex: 1,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  fieldHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
  },
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  lockedPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  lockedInputWrapper: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  fieldIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  lockedTextInput: {
    color: "#64748B",
    fontWeight: "600",
  },
  fieldDisclaimer: {
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
    paddingLeft: 2,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoKey: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
    maxWidth: 220,
  },
  infoValueMono: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#334155",
    maxWidth: 200,
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  securityText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 14,
    borderRadius: 12,
  },
  signOutButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
  },
  notLoggedInContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  notLoggedInText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
  },
  signInButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
