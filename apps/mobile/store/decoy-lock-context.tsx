import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useClerk } from "@clerk/expo";
import { useUser } from "@/store/user-context";
import { getStoredItem, setStoredItem } from "@/services/storage";

export interface DecoyDocument {
  id: string;
  name: string;
  uri: string;
  type: "image" | "pdf";
  pageCount?: number;
  subtitle?: string;
}

interface DecoyLockContextValue {
  isLocked: boolean;
  isInitialized: boolean;
  pin: string | null;
  decoyDoc: DecoyDocument | null;
  setupModalVisible: boolean;
  unlockModalVisible: boolean;
  openSetupModal: () => void;
  closeSetupModal: () => void;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;
  setLockCredentials: (doc: DecoyDocument, pin: string) => Promise<void>;
  lockApp: (doc?: DecoyDocument, newPin?: string) => Promise<void>;
  unlockApp: (enteredPin: string) => Promise<boolean>;
  triggerPanicSignOut: () => Promise<void>;
}

const DecoyLockContext = createContext<DecoyLockContextValue | undefined>(undefined);

const STORAGE_KEY_LOCKED = "chatapp_decoy_locked";
const STORAGE_KEY_PIN = "chatapp_decoy_pin";
const STORAGE_KEY_DOC = "chatapp_decoy_doc";

export function DecoyLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [decoyDoc, setDecoyDoc] = useState<DecoyDocument | null>(null);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);

  const { clearUser } = useUser();
  const clerk = useClerk();

  // Load persisted decoy lock state on mount
  useEffect(() => {
    let isMounted = true;
    async function loadState() {
      try {
        const [savedLocked, savedPin, savedDoc] = await Promise.all([
          getStoredItem(STORAGE_KEY_LOCKED),
          getStoredItem(STORAGE_KEY_PIN),
          getStoredItem(STORAGE_KEY_DOC),
        ]);

        if (!isMounted) return;

        if (savedLocked === "true") {
          setIsLocked(true);
        }
        if (savedPin) {
          setPin(savedPin);
        }
        if (savedDoc) {
          try {
            setDecoyDoc(JSON.parse(savedDoc));
          } catch {
            setDecoyDoc(null);
          }
        }
      } catch (err) {
        console.warn("[DecoyLock] Failed to load stored state:", err);
      } finally {
        if (isMounted) {
          setIsInitialized(true);
        }
      }
    }

    void loadState();
    return () => {
      isMounted = false;
    };
  }, []);

  const openSetupModal = () => setSetupModalVisible(true);
  const closeSetupModal = () => setSetupModalVisible(false);
  const openUnlockModal = () => setUnlockModalVisible(true);
  const closeUnlockModal = () => setUnlockModalVisible(false);

  const setLockCredentials = async (doc: DecoyDocument, newPin: string) => {
    await Promise.all([
      setStoredItem(STORAGE_KEY_DOC, JSON.stringify(doc)),
      setStoredItem(STORAGE_KEY_PIN, newPin),
    ]);
    setDecoyDoc(doc);
    setPin(newPin);
  };

  const lockApp = async (doc?: DecoyDocument, newPin?: string) => {
    if (doc && newPin) {
      await setLockCredentials(doc, newPin);
    }
    await setStoredItem(STORAGE_KEY_LOCKED, "true");
    setIsLocked(true);
    setSetupModalVisible(false);
    setUnlockModalVisible(false);
  };

  const unlockApp = async (enteredPin: string): Promise<boolean> => {
    if (enteredPin === pin) {
      await setStoredItem(STORAGE_KEY_LOCKED, "false");
      setIsLocked(false);
      setUnlockModalVisible(false);
      return true;
    }
    return false;
  };

  const triggerPanicSignOut = async () => {
    try {
      // Keep lock state intact in persistent storage so re-login still shows the decoy screen
      await setStoredItem(STORAGE_KEY_LOCKED, "true");
      setIsLocked(true);
      setUnlockModalVisible(false);
      setSetupModalVisible(false);

      // Sign out from Clerk
      if (clerk && typeof clerk.signOut === "function") {
        try {
          await clerk.signOut();
        } catch {}
      }

      // Clear app user context
      clearUser();

      // Route immediately back to landing
      router.replace("/");
    } catch (err) {
      console.warn("[DecoyLock] Panic sign out error:", err);
      clearUser();
      router.replace("/");
    }
  };

  return (
    <DecoyLockContext.Provider
      value={{
        isLocked,
        isInitialized,
        pin,
        decoyDoc,
        setupModalVisible,
        unlockModalVisible,
        openSetupModal,
        closeSetupModal,
        openUnlockModal,
        closeUnlockModal,
        setLockCredentials,
        lockApp,
        unlockApp,
        triggerPanicSignOut,
      }}
    >
      {children}
    </DecoyLockContext.Provider>
  );
}

export function useDecoyLock(): DecoyLockContextValue {
  const context = useContext(DecoyLockContext);
  if (!context) {
    throw new Error("useDecoyLock must be used within a DecoyLockProvider");
  }
  return context;
}
