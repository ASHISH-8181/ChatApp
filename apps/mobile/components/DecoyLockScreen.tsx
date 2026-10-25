import React, { useEffect, useState } from "react";
import {
  Animated,
  BackHandler,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@/components/Icon";
import { useDecoyLock } from "@/store/decoy-lock-context";

export function DecoyLockScreen() {
  const { isLocked, decoyDoc, unlockApp, triggerPanicSignOut } = useDecoyLock();

  const [showKeypad, setShowKeypad] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  const [shakeAnim] = useState(() => new Animated.Value(0));

  // Panic Back Button Interception
  useEffect(() => {
    if (!isLocked) return;

    // 1. Android Hardware Back Button
    const onHardwareBack = () => {
      // Panic sign out immediately
      void triggerPanicSignOut();
      return true; // prevent default back navigation
    };
    const backSub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);

    // 2. Web Browser History / Back Button
    const onPopState = () => {
      void triggerPanicSignOut();
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("popstate", onPopState);
      // Push dummy state so back button triggers popstate rather than exiting tab
      try {
        window.history.pushState(null, "", window.location.href);
      } catch {}
    }

    return () => {
      backSub.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("popstate", onPopState);
      }
    };
  }, [isLocked, triggerPanicSignOut]);

  // Handle number tap on keypad
  const handleKeypadPress = (digit: string) => {
    if (pinInput.length >= 4) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);
    setPinError(false);

    if (nextPin.length === 4) {
      setTimeout(async () => {
        const success = await unlockApp(nextPin);
        if (success) {
          setShowKeypad(false);
          setPinInput("");
        } else {
          setPinError(true);
          triggerShake();
          setTimeout(() => {
            setPinInput("");
          }, 600);
        }
      }, 150);
    }
  };

  const handleBackspace = () => {
    if (pinInput.length > 0) {
      setPinInput((prev) => prev.slice(0, -1));
      setPinError(false);
    }
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  if (!isLocked) return null;

  const doc = decoyDoc;
  const isImage = doc?.type === "image";
  const isPdf = doc?.type === "pdf";

  return (
    <View style={styles.fullscreenOverlay} pointerEvents="auto">
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        {/* Document Viewer Top Navbar */}
        <View style={styles.readerNavbar}>
          <View style={styles.readerNavLeft}>
            <View style={styles.readerDocIconWrap}>
              <Ionicons
                name={isImage ? "image-outline" : "document-text-outline"}
                size={18}
                color={isImage ? "#2563EB" : "#7C3AED"}
              />
            </View>
            <View style={styles.readerTitleWrap}>
              <Text style={styles.readerDocTitle} numberOfLines={1}>
                {doc?.name || (isImage ? "Document_Image.jpg" : "Document_View.pdf")}
              </Text>
              <Text style={styles.readerDocMeta} numberOfLines={1}>
                Read Only • {isImage ? "Image Document" : "PDF Document"}
              </Text>
            </View>
          </View>

          <View style={styles.readerNavRight}>
            {/* Harmless zoom/page controls */}
            <TouchableOpacity
              style={styles.navToolBtn}
              onPress={() => setZoomLevel((z) => (z >= 140 ? 100 : z + 20))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.navToolText}>{zoomLevel}%</Text>
            </TouchableOpacity>

            {/* Subtle Unlock Trigger */}
            <TouchableOpacity
              style={styles.navUnlockBtn}
              onPress={() => {
                setPinInput("");
                setPinError(false);
                setShowKeypad(true);
              }}
              activeOpacity={0.8}
              accessibilityLabel="Unlock"
            >
              <Ionicons name="lock-closed" size={14} color="#6D28D9" />
              <Text style={styles.navUnlockBtnText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Document Content View */}
        <View style={styles.documentBody}>
          {isImage ? (
            <ScrollView
              style={styles.scrollCanvas}
              contentContainerStyle={styles.imageCanvasContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <View style={[styles.paperSheet, { transform: [{ scale: zoomLevel / 100 }] }]}>
                {doc?.uri ? (
                  <Image
                    source={{ uri: doc.uri }}
                    style={styles.customImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.placeholderBox}>
                    <Ionicons name="image" size={48} color="#94A3B8" />
                    <Text style={styles.placeholderText}>Document image preview</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : isPdf && Platform.OS === "web" ? (
            <View style={styles.webPdfContainer}>
              {doc?.uri ? (
                <iframe
                  src={doc.uri}
                  style={{ width: "100%", height: "100%", border: "none" } as any}
                  title={doc.name || "PDF Document"}
                />
              ) : (
                <View style={styles.placeholderBox}>
                  <Ionicons name="document-text" size={48} color="#94A3B8" />
                  <Text style={styles.placeholderText}>PDF Document preview</Text>
                </View>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.scrollCanvas}
              contentContainerStyle={styles.documentCanvasContent}
              showsVerticalScrollIndicator={true}
            >
              <View style={[styles.paperSheet, styles.pdfNativeSheet, { transform: [{ scale: zoomLevel / 100 }] }]}>
                <View style={styles.pdfNativeHeader}>
                  <View style={styles.pdfNativeIconBox}>
                    <Ionicons name="document-text" size={32} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pdfNativeTitle}>{doc?.name || "Document.pdf"}</Text>
                    <Text style={styles.pdfNativeSub}>PDF Document • Read Only Disguise</Text>
                  </View>
                </View>
                <View style={styles.pdfNativeDivider} />
                <View style={styles.pdfContentPlaceholder}>
                  <Ionicons name="shield-checkmark" size={24} color="#16A34A" />
                  <Text style={styles.pdfPlaceholderTitle}>Document Protected</Text>
                  <Text style={styles.pdfPlaceholderText}>
                    This document is currently open in secure decoy mode. To restore full access to all chat tabs, tap Unlock at the top and enter your 4-digit PIN.
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Security Warning Bottom Bar */}
        <View style={styles.panicWarningBar}>
          <Ionicons name="shield-checkmark" size={13} color="#64748B" />
          <Text style={styles.panicWarningText}>
            Decoy Mode Active • Pressing back signs out account
          </Text>
        </View>

        {/* 4-Digit PIN Unlock Modal */}
        <Modal
          visible={showKeypad}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowKeypad(false)}
        >
          <View style={styles.keypadBackdrop}>
            <Animated.View style={[styles.keypadCard, { transform: [{ translateX: shakeAnim }] }]}>
              {/* Header */}
              <View style={styles.keypadHeader}>
                <View style={styles.keypadIconBox}>
                  <Ionicons name="lock-closed" size={24} color="#7C3AED" />
                </View>
                <Text style={styles.keypadTitle}>Enter Security PIN</Text>
                <Text style={styles.keypadSubtitle}>
                  Enter your 4-digit PIN to exit decoy mode and restore all tabs
                </Text>
              </View>

              {/* 4 PIN Dots */}
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((index) => {
                  const isFilled = index < pinInput.length;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.pinDot,
                        isFilled && styles.pinDotFilled,
                        pinError && styles.pinDotError,
                      ]}
                    />
                  );
                })}
              </View>

              {pinError && (
                <Text style={styles.pinErrorText}>Incorrect PIN. Try again.</Text>
              )}

              {/* Numeric Keypad Grid */}
              <View style={styles.keypadGrid}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map(
                  (key, idx) => {
                    if (key === "") {
                      return <View key={idx} style={styles.keypadKeyEmpty} />;
                    }
                    if (key === "back") {
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={styles.keypadKey}
                          onPress={handleBackspace}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="backspace-outline" size={22} color="#475569" />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={styles.keypadKey}
                        onPress={() => handleKeypadPress(key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.keypadDigit}>{key}</Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.keypadCancelBtn}
                onPress={() => {
                  setShowKeypad(false);
                  setPinInput("");
                  setPinError(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.keypadCancelBtnText}>Cancel (Keep Decoy)</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#F1F5F9",
    zIndex: 999999,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  readerNavbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  readerNavLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  readerDocIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  readerTitleWrap: {
    flex: 1,
  },
  readerDocTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  readerDocMeta: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  readerNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navToolBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  navToolText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  navUnlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  navUnlockBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6D28D9",
  },
  documentBody: {
    flex: 1,
    backgroundColor: "#E2E8F0",
  },
  scrollCanvas: {
    flex: 1,
  },
  webPdfContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  imageCanvasContent: {
    padding: 16,
    alignItems: "center",
  },
  documentCanvasContent: {
    padding: 16,
    alignItems: "center",
  },
  paperSheet: {
    width: "100%",
    maxWidth: 700,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    padding: 24,
    minHeight: 520,
  },
  customImage: {
    width: "100%",
    height: 480,
  },
  placeholderBox: {
    height: 380,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  placeholderText: {
    fontSize: 13,
    color: "#94A3B8",
  },
  pdfNativeSheet: {
    minHeight: 400,
    padding: 20,
  },
  pdfNativeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pdfNativeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  pdfNativeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  pdfNativeSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  pdfNativeDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 20,
  },
  pdfContentPlaceholder: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  pdfPlaceholderTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  pdfPlaceholderText: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  panicWarningBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  panicWarningText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  keypadBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  keypadCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  keypadHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  keypadIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  keypadTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  keypadSubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  pinDotsRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: 12,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: "#7C3AED",
    borderColor: "#7C3AED",
  },
  pinDotError: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  pinErrorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "700",
    marginBottom: 6,
  },
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 240,
    justifyContent: "space-between",
    marginTop: 8,
  },
  keypadKey: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 6,
  },
  keypadKeyEmpty: {
    width: 64,
    height: 64,
    marginVertical: 6,
  },
  keypadDigit: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  keypadCancelBtn: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  keypadCancelBtnText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
});
