import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";

/**
 * Native (Android / iOS) implementation for downloading media files to device gallery
 */
export async function downloadPhotoToDevice(imageUrl: string): Promise<boolean> {
  if (!imageUrl) return false;

  if (Platform.OS === "web") {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `photo_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      return true;
    } catch (e) {
      console.warn("Web direct download failed, fallback:", e);
      if (typeof window !== "undefined") {
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = `photo_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      }
      return false;
    }
  }

  try {
    // 1. Ask user for permission to access their media and storage
    const permission = await MediaLibrary.requestPermissionsAsync();

    // Check if they allowed it. If not, inform that access to storage is not granted
    if (permission.status !== "granted") {
      Alert.alert("Permission Denied", "Access to your storage is not granted");
      return false;
    }

    // 2. Download photo to local app storage using FileSystem
    const filename = `photo_${Date.now()}.jpg`;
    const localFileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${filename}`;
    const downloadRes = await FileSystem.downloadAsync(imageUrl, localFileUri);

    // 3. Save directly into device gallery
    const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
    try {
      await MediaLibrary.createAlbumAsync("ChatApp", asset, false);
    } catch {
      // Album creation is optional; asset is already in system gallery
    }

    Alert.alert("Photo Saved", "Photo has been saved to your gallery!");
    return true;
  } catch (err: any) {
    console.warn("Mobile download error:", err);
    if (err?.message?.toLowerCase().includes("permission") || err?.message?.toLowerCase().includes("denied")) {
      Alert.alert("Permission Denied", "Access to your storage is not granted");
    } else {
      Alert.alert("Download Failed", err?.message || "Could not save photo to gallery.");
    }
    return false;
  }
}
