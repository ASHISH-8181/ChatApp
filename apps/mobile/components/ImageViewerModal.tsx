import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { downloadPhotoToDevice } from "@/services/media-download";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl?: string | null;
  caption?: string | null;
  onClose: () => void;
}

export function ImageViewerModal({
  visible,
  imageUrl,
  caption,
  onClose,
}: ImageViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!visible || !imageUrl) return null;

  const handleDownload = async () => {
    if (!imageUrl || isDownloading) return;

    try {
      setIsDownloading(true);
      const success = await downloadPhotoToDevice(imageUrl);
      if (success) {
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
      }
    } finally {
      setIsDownloading(false);
    }
  };

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
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.8}
              hitSlop={12}
              accessibilityLabel="Close photo viewer"
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>
              Photo
            </Text>

            {/* Download Button */}
            <TouchableOpacity
              style={[
                styles.downloadButton,
                downloadSuccess && styles.downloadButtonSuccess,
              ]}
              onPress={handleDownload}
              disabled={isDownloading}
              activeOpacity={0.8}
              hitSlop={10}
              accessibilityLabel="Download photo to device"
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : downloadSuccess ? (
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              ) : (
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Full Window Image Container */}
          <TouchableOpacity
            style={styles.imageContainer}
            activeOpacity={1}
            onPress={onClose}
          >
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            )}

            <Image
              source={{ uri: imageUrl }}
              style={styles.fullscreenImage}
              contentFit="contain"
              transition={200}
              onLoadStart={() => setIsLoading(true)}
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
            />
          </TouchableOpacity>

          {/* Optional Caption Footer */}
          {caption && caption !== "Photo" ? (
            <View style={styles.captionBar}>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 11, 20, 0.96)",
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
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 18 : 12,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  downloadButtonSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    position: "relative",
  },
  fullscreenImage: {
    width: width,
    height: height * 0.78,
  },
  loadingContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  captionBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  captionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    textAlign: "center",
    lineHeight: 20,
  },
});
