import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";

interface DownloadOptions {
  onStartSaving?: () => void;
}

/**
 * Returns true when running inside Expo Go (not a dev/production build).
 * expo-media-library cannot save to gallery in Expo Go on Android SDK 53+.
 */
function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/**
 * Native (Android / iOS) implementation for downloading media files to device gallery
 *
 * Flow:
 * 1. Check whether user has already given access to storage/photos (getPermissionsAsync).
 * 2. If already granted:
 *    - Ask user confirmation: "Do you want to save this photo in your gallery?" (Allow / Deny).
 *    - If allowed -> save the photo to gallery and notify user.
 *    - If denied -> cancel operation (do not save).
 * 3. If access is not granted:
 *    - Request OS permission for photos/storage (requestPermissionsAsync).
 *    - If user grants permission -> prompt Allow / Deny confirmation -> save or cancel.
 *    - If user denies OS permission -> cancel operation and alert user.
 * 4. If user clicks download again -> restarts this entire process from step 1.
 */
export async function downloadPhotoToDevice(
  imageUrl: string,
  options?: DownloadOptions
): Promise<boolean> {
  if (!imageUrl) return false;

  // ── Web ──────────────────────────────────────────────────────────────────
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
    } catch {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `photo_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }
  }

  // ── Expo Go fallback (Android SDK 53+ cannot save to gallery) ────────────
  if (isExpoGo() && Platform.OS === "android") {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        "Expo Go Limitation",
        "Saving photos directly to gallery is not supported in Expo Go on Android. Would you like to share/open the photo instead?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Share Photo",
            onPress: async () => {
              try {
                options?.onStartSaving?.();
                const filename = `photo_${Date.now()}.jpg`;
                const localUri = `${FileSystem.cacheDirectory}${filename}`;
                await FileSystem.downloadAsync(imageUrl, localUri);
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                  await Sharing.shareAsync(localUri, { mimeType: "image/jpeg" });
                  resolve(true);
                } else {
                  Alert.alert("Error", "Sharing is not available on this device.");
                  resolve(false);
                }
              } catch (err: any) {
                console.warn("Expo Go share fallback error:", err);
                Alert.alert("Error", err?.message || "Could not share photo.");
                resolve(false);
              }
            },
          },
        ]
      );
    });
  }

  // ── Native dev/production build: full permission + save flow ─────────────
  return new Promise<boolean>(async (resolve) => {
    const executeSave = async () => {
      try {
        options?.onStartSaving?.();

        // Download photo to local cache
        const filename = `photo_${Date.now()}.jpg`;
        const localFileUri = `${FileSystem.cacheDirectory}${filename}`;
        const downloadRes = await FileSystem.downloadAsync(imageUrl, localFileUri);

        // Save into device gallery
        const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
        try {
          await MediaLibrary.createAlbumAsync("ChatApp", asset, false);
        } catch {
          // Album creation is optional; asset is already in system gallery
        }

        Alert.alert("Photo Saved", "Photo has been saved to your gallery!");
        resolve(true);
      } catch (err: any) {
        console.warn("Mobile download error:", err);
        if (
          err?.message?.toLowerCase().includes("permission") ||
          err?.message?.toLowerCase().includes("denied")
        ) {
          Alert.alert("Permission Denied", "Access to your storage is not granted.");
        } else {
          Alert.alert("Download Failed", err?.message || "Could not save photo to gallery.");
        }
        resolve(false);
      }
    };

    const promptUserToSave = () => {
      Alert.alert(
        "Save Photo",
        "Do you want to save this photo in your gallery?",
        [
          {
            text: "Deny",
            style: "cancel",
            onPress: () => {
              resolve(false);
            },
          },
          {
            text: "Allow",
            onPress: () => {
              executeSave();
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => resolve(false),
        }
      );
    };

    try {
      // Pass false to avoid AUDIO granular permission bug in expo-media-library
      const currentPerm = await MediaLibrary.getPermissionsAsync(false);

      if (currentPerm.granted || currentPerm.status === "granted") {
        promptUserToSave();
      } else {
        // Request OS permission — pass false to avoid AUDIO permission bug
        const requestPerm = await MediaLibrary.requestPermissionsAsync(false);

        if (requestPerm.granted || requestPerm.status === "granted") {
          promptUserToSave();
        } else {
          Alert.alert(
            "Permission Required",
            "Access to your photos and storage was not granted. Please allow permission to save photos to your gallery."
          );
          resolve(false);
        }
      }
    } catch (err: any) {
      console.warn("Permission check error:", err);
      Alert.alert(
        "Permission Error",
        "Could not check storage permissions. Please grant Photos/Storage permission in your device Settings and try again."
      );
      resolve(false);
    }
  });
}
