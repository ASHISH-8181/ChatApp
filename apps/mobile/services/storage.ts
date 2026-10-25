import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function sanitizeFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function getStoredItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return null;
    const safeKey = sanitizeFileName(key);
    const path = `${dir}${safeKey}.txt`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      return;
    }
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return;
    const safeKey = sanitizeFileName(key);
    const path = `${dir}${safeKey}.txt`;
    await FileSystem.writeAsStringAsync(path, value);
  } catch {}
}

export async function removeStoredItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      return;
    }
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return;
    const safeKey = sanitizeFileName(key);
    const path = `${dir}${safeKey}.txt`;
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {}
}
