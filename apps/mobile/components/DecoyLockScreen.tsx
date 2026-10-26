import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  GestureResponderEvent,
  Image,
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
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@/components/Icon";
import { useDecoyLock } from "@/store/decoy-lock-context";
import { useUser } from "@/store/user-context";
import { loginUserApi } from "@/services/api";

// Dynamically require WebView on native platforms
let WebView: any = null;
if (Platform.OS !== "web") {
  try {
    WebView = require("react-native-webview").WebView;
  } catch (err) {
    console.warn("[DecoyLock] react-native-webview not loaded", err);
  }
}

export function DecoyLockScreen() {
  const { isLocked, decoyDoc, unlockApp, triggerPanicSignOut } = useDecoyLock();
  const { currentUser } = useUser();

  const [showKeypad, setShowKeypad] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Pinch-to-zoom state for image
  const [pinchScale, setPinchScale] = useState(1);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef(1);

  // PDF reading state
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Forgot Password / Account Verification state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [accountUsername, setAccountUsername] = useState(currentUser?.username || "");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [prevUsername, setPrevUsername] = useState(currentUser?.username);

  const [shakeAnim] = useState(() => new Animated.Value(0));

  // Sync username if currentUser changes
  if (currentUser?.username && currentUser.username !== prevUsername) {
    setPrevUsername(currentUser.username);
    setAccountUsername(currentUser.username);
  }

  // Read local PDF file as Base64 on native
  useEffect(() => {
    let isMounted = true;
    if (!isLocked || decoyDoc?.type !== "pdf" || !decoyDoc?.uri) {
      Promise.resolve().then(() => {
        if (isMounted) setPdfBase64(null);
      });
      return () => {
        isMounted = false;
      };
    }

    async function loadPdfFile() {
      if (Platform.OS === "web") return;
      try {
        setPdfLoading(true);
        if (decoyDoc?.uri && (decoyDoc.uri.startsWith("file://") || decoyDoc.uri.startsWith("/"))) {
          const b64 = await FileSystem.readAsStringAsync(decoyDoc.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (isMounted) {
            setPdfBase64(b64);
          }
        }
      } catch (err) {
        console.warn("[DecoyLock] Failed to read PDF file:", err);
      } finally {
        if (isMounted) setPdfLoading(false);
      }
    }

    void loadPdfFile();
    return () => {
      isMounted = false;
    };
  }, [isLocked, decoyDoc?.type, decoyDoc?.uri]);

  // Panic Back Button Interception
  useEffect(() => {
    if (!isLocked) return;

    // 1. Android Hardware Back Button
    const onHardwareBack = () => {
      void triggerPanicSignOut();
      return true;
    };
    let backSub: { remove: () => void } | null = null;
    if (Platform.OS !== "web") {
      backSub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    }

    // 2. Web Browser History / Back Button
    const onPopState = () => {
      void triggerPanicSignOut();
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("popstate", onPopState);
      try {
        window.history.pushState(null, "", window.location.href);
      } catch {}
    }

    return () => {
      if (backSub) {
        backSub.remove();
      }
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

  // Pinch touch gestures for image zooming
  const handleImageTouchStart = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length === 2) {
      const [t1, t2] = e.nativeEvent.touches;
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      initialPinchDistRef.current = dist;
      initialPinchScaleRef.current = pinchScale;
    }
  };

  const handleImageTouchMove = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length === 2 && initialPinchDistRef.current) {
      const [t1, t2] = e.nativeEvent.touches;
      const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
      const factor = dist / initialPinchDistRef.current;
      const nextScale = Math.min(Math.max(initialPinchScaleRef.current * factor, 0.75), 4);
      setPinchScale(nextScale);
      setZoomLevel(Math.round(nextScale * 100));
    }
  };

  const handleImageTouchEnd = () => {
    initialPinchDistRef.current = null;
    if (pinchScale < 1) {
      setPinchScale(1);
      setZoomLevel(100);
    }
  };

  const handleDoubleTapReset = () => {
    setPinchScale(1);
    setZoomLevel(100);
  };

  // Account Unlock Fallback Handler
  const handleAccountUnlock = async () => {
    if (!accountUsername.trim()) {
      setAccountError("Please enter your account username or phone number.");
      return;
    }
    setAccountError(null);
    setIsVerifyingAccount(true);
    try {
      const res = await loginUserApi(accountUsername.trim(), accountPassword.trim() || undefined);
      if (res?.user) {
        // Verification succeeded!
        setShowForgotModal(false);
        setAccountPassword("");
        // Unlock decoy mode
        await unlockApp(accountPassword || "0000");
      }
    } catch (err: any) {
      // If user is currently signed in and entered their exact username, allow unlock
      if (
        currentUser &&
        accountUsername.trim().toLowerCase() === currentUser.username.toLowerCase() &&
        !(currentUser as any).password
      ) {
        setShowForgotModal(false);
        setAccountPassword("");
        await unlockApp("0000");
        return;
      }
      setAccountError(err.message || "Invalid credentials. Please verify and try again.");
    } finally {
      setIsVerifyingAccount(false);
    }
  };

  // HTML content for rendering multi-page PDF with PDF.js inside WebView
  const pdfHtml = useMemo(() => {
    const sourceParam = pdfBase64
      ? `{ data: atob("${pdfBase64}") }`
      : decoyDoc?.uri
      ? `"${decoyDoc.uri}"`
      : "null";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #0F172A;
      width: 100%;
      min-height: 100%;
      font-family: -apple-system, Roboto, sans-serif;
      touch-action: pan-x pan-y pinch-zoom;
    }
    #container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 6px;
      gap: 12px;
    }
    canvas {
      width: 95%;
      max-width: 850px;
      height: auto;
      background: #FFFFFF;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      border-radius: 4px;
    }
    #loading {
      color: #94A3B8;
      text-align: center;
      padding: 40px 16px;
      font-size: 14px;
    }
    #pageCountBadge {
      position: fixed;
      bottom: 12px;
      right: 12px;
      background: rgba(15, 23, 42, 0.85);
      color: #F8FAFC;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="loading">Loading PDF document...</div>
  <div id="container"></div>
  <div id="pageCountBadge" style="display:none;"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    async function renderPdf() {
      try {
        const loadingTask = pdfjsLib.getDocument(${sourceParam});
        const pdf = await loadingTask.promise;
        document.getElementById('loading').style.display = 'none';
        const badge = document.getElementById('pageCountBadge');
        badge.innerText = 'Pages: ' + pdf.numPages;
        badge.style.display = 'block';

        const container = document.getElementById('container');
        for (let num = 1; num <= pdf.numPages; num++) {
          const page = await pdf.getPage(num);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          container.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (err) {
        document.getElementById('loading').innerText = 'Could not load PDF document preview: ' + err.message;
      }
    }
    renderPdf();
  </script>
</body>
</html>
    `;
  }, [pdfBase64, decoyDoc?.uri]);

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
                name={isImage ? "image" : "document-text"}
                size={18}
                color={isImage ? "#2563EB" : "#7C3AED"}
              />
            </View>
            <View style={styles.readerTitleWrap}>
              <Text style={styles.readerDocTitle} numberOfLines={1}>
                {doc?.name || (isImage ? "Document_Image.jpg" : "Document_Report.pdf")}
              </Text>
              <Text style={styles.readerDocMeta} numberOfLines={1}>
                Read Only • {isImage ? "Image Document" : "PDF Document"}
              </Text>
            </View>
          </View>

          <View style={styles.readerNavRight}>
            <TouchableOpacity
              style={styles.navZoomBtn}
              onPress={() => {
                const next = Math.max(75, zoomLevel - 25);
                setZoomLevel(next);
                setPinchScale(next / 100);
              }}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Zoom Out"
            >
              <Ionicons name="remove" size={14} color="#64748B" />
            </TouchableOpacity>
            <Text style={styles.navZoomText}>{zoomLevel}%</Text>
            <TouchableOpacity
              style={styles.navZoomBtn}
              onPress={() => {
                const next = Math.min(300, zoomLevel + 25);
                setZoomLevel(next);
                setPinchScale(next / 100);
              }}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Zoom In"
            >
              <Ionicons name="add" size={14} color="#64748B" />
            </TouchableOpacity>

            {/* Unlock Trigger */}
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
              <Ionicons name="lock-closed" size={13} color="#6D28D9" />
              <Text style={styles.navUnlockBtnText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Document Content View */}
        <View style={styles.documentBody}>
          {isImage ? (
            <ScrollView
              style={styles.scrollCanvas}
              contentContainerStyle={[
                styles.imageCanvasContent,
                { minWidth: `${zoomLevel}%` },
              ]}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsVerticalScrollIndicator={true}
              showsHorizontalScrollIndicator={true}
            >
              <View
                onTouchStart={handleImageTouchStart}
                onTouchMove={handleImageTouchMove}
                onTouchEnd={handleImageTouchEnd}
                style={[
                  styles.imageWrapper,
                  {
                    transform: [{ scale: pinchScale }],
                  },
                ]}
              >
                {doc?.uri ? (
                  <TouchableOpacity activeOpacity={1} onPress={handleDoubleTapReset}>
                    <Image
                      source={{ uri: doc.uri }}
                      style={styles.customImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.placeholderBox}>
                    <Ionicons name="image" size={48} color="#94A3B8" />
                    <Text style={styles.placeholderText}>Document image preview</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : isPdf ? (
            Platform.OS === "web" ? (
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
                    <Text style={styles.placeholderText}>No PDF document selected</Text>
                  </View>
                )}
              </View>
            ) : WebView ? (
              <View style={styles.nativePdfContainer}>
                {pdfLoading ? (
                  <View style={styles.pdfLoadingBox}>
                    <ActivityIndicator size="large" color="#6D28D9" />
                    <Text style={styles.pdfLoadingText}>Loading PDF document...</Text>
                  </View>
                ) : (
                  <WebView
                    originWhitelist={["*"]}
                    source={{ html: pdfHtml }}
                    style={styles.webView}
                    scalesPageToFit={true}
                    bounces={false}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowFileAccess={true}
                    allowUniversalAccessFromFileURLs={true}
                  />
                )}
              </View>
            ) : (
              <View style={styles.placeholderBox}>
                <Ionicons name="document-text" size={48} color="#94A3B8" />
                <Text style={styles.placeholderText}>
                  {doc?.name || "PDF Document"}
                </Text>
              </View>
            )
          ) : null}
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
                <Text style={styles.pinErrorText}>Incorrect PIN. Please try again.</Text>
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

              {/* Forgot Decoy PIN Option */}
              <TouchableOpacity
                style={styles.forgotPinBtn}
                onPress={() => {
                  setShowKeypad(false);
                  setAccountError(null);
                  setShowForgotModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="key-outline" size={14} color="#6366F1" />
                <Text style={styles.forgotPinBtnText}>Forgot Decoy PIN? Unlock with Account</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        {/* Forgot Password / Account Unlock Modal */}
        <Modal
          visible={showForgotModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowForgotModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keypadBackdrop}
          >
            <View style={styles.forgotCard}>
              <View style={styles.forgotHeader}>
                <View style={styles.forgotIconBox}>
                  <Ionicons name="shield-checkmark" size={24} color="#4F46E5" />
                </View>
                <Text style={styles.forgotTitle}>Account Unlock Fallback</Text>
                <Text style={styles.forgotSubtitle}>
                  Enter your username and password to verify identity and exit decoy mode.
                </Text>
              </View>

              {accountError && (
                <View style={styles.forgotErrorBox}>
                  <Ionicons name="alert-circle" size={15} color="#EF4444" />
                  <Text style={styles.forgotErrorText}>{accountError}</Text>
                </View>
              )}

              <View style={styles.forgotInputGroup}>
                <Text style={styles.forgotInputLabel}>Username or Phone Number</Text>
                <TextInput
                  style={styles.forgotInput}
                  placeholder="e.g. ashish or 9876543210"
                  placeholderTextColor="#94A3B8"
                  value={accountUsername}
                  onChangeText={setAccountUsername}
                  autoCapitalize="none"
                  editable={!isVerifyingAccount}
                />
              </View>

              <View style={styles.forgotInputGroup}>
                <Text style={styles.forgotInputLabel}>Account Password</Text>
                <TextInput
                  style={styles.forgotInput}
                  placeholder="Enter your account password"
                  placeholderTextColor="#94A3B8"
                  value={accountPassword}
                  onChangeText={setAccountPassword}
                  secureTextEntry
                  editable={!isVerifyingAccount}
                />
              </View>

              <TouchableOpacity
                style={[styles.forgotSubmitBtn, isVerifyingAccount && { opacity: 0.7 }]}
                onPress={handleAccountUnlock}
                disabled={isVerifyingAccount}
                activeOpacity={0.85}
              >
                {isVerifyingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.forgotSubmitBtnText}>Verify & Unlock App</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.forgotCancelBtn}
                onPress={() => {
                  setShowForgotModal(false);
                  setShowKeypad(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.forgotCancelBtnText}>Back to PIN Keypad</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
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
    backgroundColor: "#0F172A",
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
  navZoomBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  navZoomText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    minWidth: 32,
    textAlign: "center",
  },
  navUnlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    backgroundColor: "#0F172A",
  },
  scrollCanvas: {
    flex: 1,
  },
  imageCanvasContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  imageWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  customImage: {
    width: 360,
    height: 520,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  webPdfContainer: {
    flex: 1,
    backgroundColor: "#1E293B",
  },
  nativePdfContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  webView: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  pdfLoadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  pdfLoadingText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  placeholderBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  panicWarningBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  panicWarningText: {
    fontSize: 10.5,
    color: "#94A3B8",
    fontWeight: "500",
  },
  keypadBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  keypadCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  keypadHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  keypadIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  keypadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  keypadSubtitle: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  pinDotsRow: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 12,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    borderColor: "#7C3AED",
    backgroundColor: "#7C3AED",
  },
  pinDotError: {
    borderColor: "#EF4444",
    backgroundColor: "#EF4444",
  },
  pinErrorText: {
    fontSize: 11,
    color: "#EF4444",
    fontWeight: "600",
    marginBottom: 8,
  },
  keypadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: 240,
    gap: 12,
    marginVertical: 8,
  },
  keypadKey: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  keypadKeyEmpty: {
    width: 62,
    height: 62,
  },
  keypadDigit: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  keypadCancelBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  keypadCancelBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  forgotPinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingVertical: 6,
  },
  forgotPinBtnText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#6366F1",
  },
  forgotCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  forgotHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  forgotIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  forgotTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  forgotSubtitle: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  forgotErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    width: "100%",
  },
  forgotErrorText: {
    fontSize: 11,
    color: "#DC2626",
    flex: 1,
  },
  forgotInputGroup: {
    width: "100%",
    marginBottom: 12,
  },
  forgotInputLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 5,
  },
  forgotInput: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0F172A",
  },
  forgotSubmitBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    backgroundColor: "#4F46E5",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  forgotSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  forgotCancelBtn: {
    marginTop: 10,
    paddingVertical: 6,
  },
  forgotCancelBtnText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
});
