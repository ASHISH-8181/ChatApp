import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export interface TokenCache {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, value: string) => Promise<void>;
  clearToken?: (key: string) => void;
}

export const tokenCache: TokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn("[TokenCache] Error getting token:", err);
      return null;
    }
  },

  async saveToken(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.warn("[TokenCache] Error saving token:", err);
    }
  },

  clearToken(key: string): void {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return;
      }
      SecureStore.deleteItemAsync(key).catch((err) => {
        console.warn("[TokenCache] Error deleting token:", err);
      });
    } catch (err) {
      console.warn("[TokenCache] Error clearing token:", err);
    }
  },
};
