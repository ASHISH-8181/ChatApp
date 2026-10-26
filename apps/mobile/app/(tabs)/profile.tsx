import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@/components/Icon";
import { useClerk } from "@clerk/expo";
import { useUser } from "@/store/user-context";
import { socketService } from "@/services/socket";
import { updateUserDisplayName, updateUserProfile, uploadImageApi } from "@/services/api";
import { UserAvatar } from "@/components/UserAvatar";
import { LockNavButton } from "@/components/LockNavButton";
import { ThemeNavButton } from "@/components/ThemeNavButton";
import { useTheme } from "@/store/theme-context";
import { Fonts } from "@/constants/theme";

export default function ProfileScreen() {
  const { currentUser, setCurrentUser } = useUser();
  const { colors, isDark, theme, setTheme } = useTheme();
  const { signOut } = useClerk();

  const [name, setName] = useState(currentUser?.name || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
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

  const handlePickImage = async (mode: "camera" | "library") => {
    setShowPhotoModal(false);
    try {
      if (mode === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission Required", "Camera permission is required to capture photos.");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission Required", "Photo library permission is required to choose photos.");
          return;
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      };

      const result =
        mode === "camera"
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setUploadingAvatar(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        const dataUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;

        const uploadRes = await uploadImageApi(dataUri, "chatapp/avatars");
        const updated = await updateUserProfile(currentUser.id, { avatarUrl: uploadRes.url });
        setCurrentUser(updated);
        setSuccessMsg("Profile picture updated successfully!");
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err: any) {
      console.error("[Profile Avatar Error]:", err);
      setErrorMsg(err.message || "Failed to update profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemovePhoto = async () => {
    setShowPhotoModal(false);
    try {
      setUploadingAvatar(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const updated = await updateUserProfile(currentUser.id, { avatarUrl: null });
      setCurrentUser(updated);
      setSuccessMsg("Profile picture removed.");
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to remove profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

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
    const performSignOut = async () => {
      try {
        socketService.disconnect();
        await signOut().catch(() => {});
      } catch (e) {
        console.warn("Clerk signOut error:", e);
      } finally {
        setCurrentUser(null);
        router.replace("/");
      }
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to sign out?");
      if (confirmed) void performSignOut();
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out of your account?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: () => void performSignOut() },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>My Profile</Text>
        <View style={styles.headerRightGroup}>
          <ThemeNavButton />
          <LockNavButton compact={true} />
          <View style={[styles.onlineBadge, isDark && { backgroundColor: "#143324" }]}>
            <View style={styles.onlineDot} />
            <Text style={[styles.onlineText, isDark && { color: "#4ADE80" }]}>Active</Text>
          </View>
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
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.avatarTouchArea}
              onPress={() => setShowPhotoModal(true)}
              activeOpacity={0.8}
              disabled={uploadingAvatar}
            >
              <UserAvatar
                name={currentUser.name}
                username={currentUser.username}
                avatarUrl={currentUser.avatarUrl}
                size={96}
                fontSize={38}
              />
              {uploadingAvatar && (
                <View style={styles.avatarLoadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <Text style={[styles.heroName, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>{currentUser.name}</Text>
            <Text style={[styles.heroUsername, { color: colors.primary, fontFamily: Fonts.medium }]}>@{currentUser.username}</Text>

            <TouchableOpacity
              style={[styles.changePhotoBtn, { backgroundColor: colors.primaryLight, borderColor: colors.border }]}
              onPress={() => setShowPhotoModal(true)}
              activeOpacity={0.7}
              disabled={uploadingAvatar}
            >
              <Ionicons name="camera-outline" size={15} color={colors.primary} />
              <Text style={[styles.changePhotoText, { color: colors.primary, fontFamily: Fonts.semiBold }]}>
                {currentUser.avatarUrl ? "Change Profile Picture" : "Upload Profile Picture"}
              </Text>
            </TouchableOpacity>

            <View style={styles.badgeRow}>
              <View style={[styles.memberBadge, isDark && { backgroundColor: "#1A2238" }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                <Text style={[styles.memberBadgeText, { color: colors.primary, fontFamily: Fonts.semiBold }]}>Verified Member</Text>
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
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>Account Credentials</Text>

            {/* Editable Field: Full Name */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, fontFamily: Fonts.medium }]}>Display Name</Text>
                <Text style={[styles.fieldHint, { color: colors.primary, fontFamily: Fonts.semiBold }]}>Editable</Text>
              </View>
              <View style={[styles.inputWrapper, { backgroundColor: isDark ? colors.surfaceElevated : "#FFFFFF", borderColor: colors.border }]}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary, fontFamily: Fonts.regular }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
              </View>
              {isNameChanged ? (
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.buttonDisabled]}
                  onPress={handleSaveName}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                      <Text style={[styles.saveButtonText, { fontFamily: Fonts.bold }]}>Save Display Name</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Locked Field: Username */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, fontFamily: Fonts.medium }]}>Username</Text>
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={12} color="#DC2626" />
                  <Text style={styles.lockedPillText}>Cannot be changed</Text>
                </View>
              </View>
              <View style={[styles.inputWrapper, styles.lockedInputWrapper, { backgroundColor: isDark ? colors.surfaceElevated : "#F1F5F9", borderColor: colors.border }]}>
                <Ionicons name="at" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.textInput, styles.lockedTextInput, { color: colors.textMuted, fontFamily: Fonts.semiBold }]}
                  value={currentUser.username}
                  editable={false}
                />
                <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              </View>
              <Text style={[styles.fieldDisclaimer, { color: colors.textMuted }]}>
                Unique usernames cannot be altered once registered.
              </Text>
            </View>

            {/* Locked Field: Phone Number */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary, fontFamily: Fonts.medium }]}>Phone Number</Text>
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={12} color="#DC2626" />
                  <Text style={styles.lockedPillText}>Cannot be changed</Text>
                </View>
              </View>
              <View style={[styles.inputWrapper, styles.lockedInputWrapper, { backgroundColor: isDark ? colors.surfaceElevated : "#F1F5F9", borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={18} color={colors.textMuted} style={styles.fieldIcon} />
                <TextInput
                  style={[styles.textInput, styles.lockedTextInput, { color: colors.textMuted, fontFamily: Fonts.semiBold }]}
                  value={currentUser.phoneNumber}
                  editable={false}
                />
                <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              </View>
              <Text style={[styles.fieldDisclaimer, { color: colors.textMuted }]}>
                Your registered phone number is permanently bound to this account.
              </Text>
            </View>
          </View>

          {/* Theme Preference Switcher Card */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.themeSectionHeader}>
              <View style={[styles.themeIconBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name={isDark ? "moon" : "sunny"} size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>
                  Appearance & Theme
                </Text>
                <Text style={[styles.fieldDisclaimer, { color: colors.textSecondary, marginTop: 2 }]}>
                  Matches the exact same clean design in both light and dark.
                </Text>
              </View>
            </View>

            <View style={styles.themeSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.themeOptionBtn,
                  { backgroundColor: isDark ? colors.surfaceElevated : "#F8FAFC", borderColor: colors.border },
                  theme === "light" && { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setTheme("light")}
                activeOpacity={0.7}
              >
                <Ionicons name="sunny" size={20} color={theme === "light" ? colors.primary : colors.textSecondary} />
                <Text style={[styles.themeOptionText, { color: theme === "light" ? colors.primary : colors.textPrimary, fontFamily: Fonts.semiBold }]}>
                  Light
                </Text>
                {theme === "light" && (
                  <View style={[styles.themeActiveDot, { backgroundColor: colors.primary }]} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.themeOptionBtn,
                  { backgroundColor: isDark ? colors.surfaceElevated : "#F8FAFC", borderColor: colors.border },
                  theme === "dark" && { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setTheme("dark")}
                activeOpacity={0.7}
              >
                <Ionicons name="moon" size={20} color={theme === "dark" ? colors.primary : colors.textSecondary} />
                <Text style={[styles.themeOptionText, { color: theme === "dark" ? colors.primary : colors.textPrimary, fontFamily: Fonts.semiBold }]}>
                  Dark
                </Text>
                {theme === "dark" && (
                  <View style={[styles.themeActiveDot, { backgroundColor: colors.primary }]} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign Out Action */}
          <TouchableOpacity
            style={[styles.signOutButton, isDark && { backgroundColor: "#2D1518", borderColor: "#7F1D1D" }]}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={[styles.signOutButtonText, { fontFamily: Fonts.bold }]}>Sign Out of ChatApp</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Photo Picker Action Modal */}
      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPhotoModal(false)}
        >
          <View style={[styles.photoSheetContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.photoSheetHeader}>
              <Text style={[styles.photoSheetTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>Profile Picture</Text>
              <Text style={[styles.photoSheetSubtitle, { color: colors.textSecondary }]}>
                Choose how you would like to update your photo
              </Text>
            </View>

            <View style={styles.photoOptionsList}>
              <TouchableOpacity
                style={[styles.photoOptionItem, { backgroundColor: isDark ? colors.surfaceElevated : "#F8FAFC", borderColor: colors.border }]}
                onPress={() => handlePickImage("camera")}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="camera" size={20} color={colors.primary} />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={[styles.photoOptionTitle, { color: colors.textPrimary, fontFamily: Fonts.semiBold }]}>Take Photo</Text>
                  <Text style={[styles.photoOptionDesc, { color: colors.textSecondary }]}>Use camera to capture a new photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.photoOptionItem, { backgroundColor: isDark ? colors.surfaceElevated : "#F8FAFC", borderColor: colors.border }]}
                onPress={() => handlePickImage("library")}
                activeOpacity={0.7}
              >
                <View style={[styles.photoOptionIconWrap, { backgroundColor: "#F0FDF4" }]}>
                  <Ionicons name="images" size={20} color="#16A34A" />
                </View>
                <View style={styles.photoOptionTextWrap}>
                  <Text style={[styles.photoOptionTitle, { color: colors.textPrimary, fontFamily: Fonts.semiBold }]}>Choose from Library</Text>
                  <Text style={[styles.photoOptionDesc, { color: colors.textSecondary }]}>Select an image from device gallery</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {currentUser.avatarUrl ? (
                <TouchableOpacity
                  style={[styles.photoOptionItem, styles.photoOptionItemDestructive, isDark && { backgroundColor: "#2D1518", borderColor: "#7F1D1D" }]}
                  onPress={handleRemovePhoto}
                  activeOpacity={0.7}
                >
                  <View style={[styles.photoOptionIconWrap, { backgroundColor: "#FEF2F2" }]}>
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </View>
                  <View style={styles.photoOptionTextWrap}>
                    <Text style={[styles.photoOptionTitle, { color: "#DC2626", fontFamily: Fonts.semiBold }]}>Remove Photo</Text>
                    <Text style={[styles.photoOptionDesc, { color: colors.textSecondary }]}>Revert to name initials badge</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#FECACA" />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.photoCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : "#F1F5F9" }]}
              onPress={() => setShowPhotoModal(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.photoCancelText, { color: colors.textPrimary, fontFamily: Fonts.semiBold }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
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
    paddingBottom: 110,
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
  avatarTouchArea: {
    position: "relative",
    marginBottom: 12,
  },
  avatarLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#2563EB",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  changePhotoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  photoSheetContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "100%",
    maxWidth: 380,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  photoSheetHeader: {
    marginBottom: 16,
    alignItems: "center",
  },
  photoSheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  photoSheetSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  photoOptionsList: {
    gap: 10,
    marginBottom: 16,
  },
  photoOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  photoOptionItemDestructive: {
    borderColor: "#FEE2E2",
    backgroundColor: "#FFF5F5",
  },
  photoOptionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  photoOptionTextWrap: {
    flex: 1,
  },
  photoOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  photoOptionDesc: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  photoCancelBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  photoCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },
  themeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themeIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  themeSelectorRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  themeOptionBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  themeOptionText: {
    fontSize: 13,
  },
  themeActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
});
