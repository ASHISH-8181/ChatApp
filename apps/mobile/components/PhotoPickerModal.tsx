import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface PhotoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSendPhoto: (data: {
    localUri: string;
    base64?: string | null;
    isViewOnce: boolean;
    caption: string;
  }) => void;
}

export function PhotoPickerModal({
  visible,
  onClose,
  onSendPhoto,
}: PhotoPickerModalProps) {
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    base64?: string | null;
  } | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(true); // Default to view-once as requested
  const [caption, setCaption] = useState("");

  // Take photo with camera
  const handleLaunchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to capture photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64,
        });
      }
    } catch (err: any) {
      console.error("[Camera Error]:", err);
      Alert.alert("Camera Error", "Failed to open camera.");
    }
  };

  // Pick photo from gallery
  const handleLaunchGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission Required",
          "Photo library permission is required to select photos."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage({
          uri: asset.uri,
          base64: asset.base64,
        });
      }
    } catch (err: any) {
      console.error("[Gallery Error]:", err);
      Alert.alert("Gallery Error", "Failed to open photo library.");
    }
  };

  // Immediate send: pass local image data to parent for instant optimistic display & background Cloudinary upload
  const handleSend = () => {
    if (!selectedImage) return;

    onSendPhoto({
      localUri: selectedImage.uri,
      base64: selectedImage.base64,
      isViewOnce,
      caption: caption.trim(),
    });

    // Instantly close modal and reset
    handleClose();
  };

  const handleClose = () => {
    setSelectedImage(null);
    setCaption("");
    setIsViewOnce(true);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {selectedImage ? (
          // PREVIEW & SEND SCREEN
          <SafeAreaView style={styles.previewSafeArea}>
            <KeyboardAvoidingView
              style={styles.keyboardContainer}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              {/* Top Controls */}
              <View style={styles.previewHeader}>
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                {isViewOnce && (
                  <View style={styles.viewOnceNotice}>
                    <Ionicons name="lock-closed" size={13} color="#10B981" />
                    <Text style={styles.viewOnceNoticeText}>View Once Photo</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={handleClose}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Photo Image Display */}
              <View style={styles.previewImageContainer}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.previewImage}
                  contentFit="contain"
                />
              </View>

              {/* Bottom Caption & View Once Controls */}
              <View style={styles.bottomControls}>
                <View style={styles.captionBar}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Add a caption..."
                    placeholderTextColor="#64748B"
                    value={caption}
                    onChangeText={setCaption}
                    maxLength={200}
                  />

                  {/* View Once Toggle Button (WhatsApp Style Circle '1') */}
                  <TouchableOpacity
                    style={[
                      styles.viewOnceToggle,
                      isViewOnce && styles.viewOnceToggleActive,
                    ]}
                    onPress={() => setIsViewOnce((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="timer-outline"
                      size={14}
                      color={isViewOnce ? "#10B981" : "#94A3B8"}
                    />
                    <Text
                      style={[
                        styles.viewOnceToggleNumber,
                        isViewOnce && styles.viewOnceToggleNumberActive,
                      ]}
                    >
                      1
                    </Text>
                  </TouchableOpacity>

                  {/* Send Button */}
                  <TouchableOpacity
                    style={styles.sendButton}
                    onPress={handleSend}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {isViewOnce && (
                  <Text style={styles.viewOnceHint}>
                    Recipient can only open and view this photo once.
                  </Text>
                )}
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        ) : (
          // BOTTOM SHEET: PICK SOURCE (CAMERA OR GALLERY)
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={handleClose}
          >
            <View style={styles.sheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Share Instant Photo</Text>
              <Text style={styles.sheetSubtitle}>
                Take a new photo or select from your gallery with one-time view protection.
              </Text>

              <View style={styles.optionsRow}>
                {/* Camera Option */}
                <TouchableOpacity
                  style={styles.optionCard}
                  onPress={handleLaunchCamera}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: "#3B82F6" }]}>
                    <Ionicons name="camera" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={styles.optionTitle}>Camera</Text>
                  <Text style={styles.optionDesc}>Capture now</Text>
                </TouchableOpacity>

                {/* Gallery Option */}
                <TouchableOpacity
                  style={styles.optionCard}
                  onPress={handleLaunchGallery}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: "#8B5CF6" }]}>
                    <Ionicons name="images" size={28} color="#FFFFFF" />
                  </View>
                  <Text style={styles.optionTitle}>Gallery</Text>
                  <Text style={styles.optionDesc}>Choose photos</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.cancelSheetButton} onPress={handleClose}>
                <Text style={styles.cancelSheetText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#0B1526",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 40 : 28,
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  sheetSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 24,
    lineHeight: 18,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    marginBottom: 20,
  },
  optionCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: "center",
  },
  optionIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  optionTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#FFFFFF",
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#64748B",
    marginTop: 2,
  },
  cancelSheetButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
  },
  cancelSheetText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#94A3B8",
  },

  // PREVIEW STYLES
  previewSafeArea: {
    flex: 1,
    backgroundColor: "#050B14",
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: "space-between",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnceNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewOnceNoticeText: {
    color: "#10B981",
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  previewImageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  previewImage: {
    width: width,
    height: height * 0.65,
  },
  uploadOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5, 11, 20, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  uploadOverlayText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
  bottomControls: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 16 : 18,
    gap: 8,
  },
  captionBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 28,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: 10,
  },
  captionInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts.regular,
    maxHeight: 100,
  },
  viewOnceToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    gap: 2,
  },
  viewOnceToggleActive: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "#10B981",
  },
  viewOnceToggleNumber: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
    fontWeight: "700",
  },
  viewOnceToggleNumberActive: {
    color: "#10B981",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  viewOnceHint: {
    color: "#94A3B8",
    fontSize: 12,
    fontFamily: Fonts.medium,
    textAlign: "center",
    marginTop: 2,
  },
});
