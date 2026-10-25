import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface ViewOncePhotoModalProps {
  visible: boolean;
  imageUrl?: string | null;
  senderName?: string;
  onClose: () => void;
}

export function ViewOncePhotoModal({
  visible,
  imageUrl,
  senderName = "Photo",
  onClose,
}: ViewOncePhotoModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.viewOnceBadge}>
                <Ionicons name="time-outline" size={14} color="#F59E0B" />
                <Text style={styles.viewOnceBadgeText}>1</Text>
              </View>
              <View>
                <Text style={styles.senderName}>{senderName}</Text>
                <Text style={styles.viewOnceSubtitle}>View once photo</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Photo Viewer Container */}
          <View style={styles.photoContainer}>
            {isLoading && !hasError && (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loaderText}>Loading photo...</Text>
              </View>
            )}

            {hasError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
                <Text style={styles.errorTitle}>Photo Expired or Unavailable</Text>
                <Text style={styles.errorSubtitle}>
                  This view-once photo has already been opened or deleted.
                </Text>
                <TouchableOpacity style={styles.errorButton} onPress={onClose}>
                  <Text style={styles.errorButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              imageUrl && (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  contentFit="contain"
                  transition={200}
                  onLoadStart={() => setIsLoading(true)}
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                  }}
                />
              )
            )}
          </View>

          {/* Bottom Security Footer */}
          <View style={styles.footer}>
            <View style={styles.footerPill}>
              <Ionicons name="lock-closed" size={13} color="#94A3B8" />
              <Text style={styles.footerText}>
                Photo will disappear permanently once closed
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#050B14",
  },
  safeArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  viewOnceBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1.5,
    borderColor: "#F59E0B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  viewOnceBadgeText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#F59E0B",
    fontWeight: "700",
  },
  senderName: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: "#FFFFFF",
  },
  viewOnceSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#94A3B8",
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  image: {
    width: width,
    height: height * 0.75,
  },
  loaderContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loaderText: {
    color: "#94A3B8",
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#EF4444",
    marginTop: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
  errorButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  errorButtonText: {
    color: "#FFFFFF",
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  footerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  footerText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
  },
});
