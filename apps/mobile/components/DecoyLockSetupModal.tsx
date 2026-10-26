import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@/components/Icon";
import {
  useDecoyLock,
  type DecoyDocument,
} from "@/store/decoy-lock-context";

export function DecoyLockSetupModal() {
  const {
    setupModalVisible,
    closeSetupModal,
    pin: currentPin,
    decoyDoc: currentDoc,
    lockApp,
  } = useDecoyLock();

  const isAlreadyConfigured = Boolean(currentPin && currentPin.length === 4 && currentDoc);

  const [mode, setMode] = useState<"quick_lock" | "configure">(
    isAlreadyConfigured ? "quick_lock" : "configure"
  );

  const [selectedDoc, setSelectedDoc] = useState<DecoyDocument | null>(currentDoc || null);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pickingFile, setPickingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pick image via ImagePicker
  const handlePickImage = async () => {
    try {
      setPickingFile(true);
      setErrorMsg(null);
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const newDoc: DecoyDocument = {
          id: `custom-img-${Date.now()}`,
          name: asset.fileName || "Uploaded_Document_Image.jpg",
          uri: asset.uri,
          type: "image",
          subtitle: "Uploaded Image Document",
          pageCount: 1,
        };
        setSelectedDoc(newDoc);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to pick image file.");
    } finally {
      setPickingFile(false);
    }
  };

  // Pick PDF/Document via DocumentPicker
  const handlePickPdf = async () => {
    try {
      setPickingFile(true);
      setErrorMsg(null);
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const isPdf =
          (asset.mimeType || "").includes("pdf") ||
          asset.name.toLowerCase().endsWith(".pdf");
        const newDoc: DecoyDocument = {
          id: `custom-doc-${Date.now()}`,
          name: asset.name,
          uri: asset.uri,
          type: isPdf ? "pdf" : "image",
          subtitle: isPdf ? "Uploaded PDF Document" : "Uploaded Document Image",
          pageCount: 1,
        };
        setSelectedDoc(newDoc);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to select PDF document.");
    } finally {
      setPickingFile(false);
    }
  };

  // Submit and lock
  const handleSaveAndLock = async () => {
    setErrorMsg(null);

    // If configuring or setting new PIN
    if (mode === "configure" || !isAlreadyConfigured) {
      if (!selectedDoc) {
        setErrorMsg("Please upload an image or PDF document first.");
        return;
      }

      const cleanPin = pinInput.trim();
      const cleanConfirm = confirmPinInput.trim();

      if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
        setErrorMsg("Please enter a valid 4-digit numeric PIN (e.g. 1234).");
        return;
      }

      if (cleanPin !== cleanConfirm) {
        setErrorMsg("PIN and Confirmation PIN do not match.");
        return;
      }

      await lockApp(selectedDoc, cleanPin);
    } else {
      // Quick lock with already configured PIN and doc
      if (!selectedDoc && !currentDoc) {
        setErrorMsg("Please upload an image or PDF document first.");
        return;
      }
      await lockApp(selectedDoc || currentDoc!, currentPin || "1234");
    }
  };

  return (
    <Modal
      visible={setupModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={closeSetupModal}
    >
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.modalCardWrap} edges={["bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardAvoid}
          >
            <View style={styles.modalCard}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleRow}>
                  <View style={styles.modalHeaderIconWrap}>
                    <Ionicons name="lock-closed" size={20} color="#7C3AED" />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>Decoy Lock</Text>
                    <Text style={styles.modalSubtitle}>Disguise app as a harmless document</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={closeSetupModal}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                bounces={true}
                nestedScrollEnabled={true}
              >
                {/* Quick Lock Mode if already configured */}
                {isAlreadyConfigured && mode === "quick_lock" ? (
                  <View style={styles.quickLockSection}>
                    <View style={styles.statusBanner}>
                      <Ionicons name="shield-checkmark" size={20} color="#16A34A" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.statusBannerTitle}>Lock Ready</Text>
                        <Text style={styles.statusBannerDesc}>
                          PIN is set (••••). Tap below to lock all tabs and display this document.
                        </Text>
                      </View>
                    </View>

                    {/* Active Document Card */}
                    <Text style={styles.fieldLabel}>Active Decoy Document</Text>
                    {selectedDoc && (
                      <View style={styles.selectedDocCard}>
                        <View style={styles.selectedDocIconBox}>
                          <Ionicons
                            name={selectedDoc.type === "image" ? "image" : "document-text"}
                            size={24}
                            color="#2563EB"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedDocName} numberOfLines={1}>
                            {selectedDoc.name}
                          </Text>
                          <Text style={styles.selectedDocSub}>{selectedDoc.subtitle || "Selected Document"}</Text>
                        </View>
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>Ready</Text>
                        </View>
                      </View>
                    )}

                    {/* Lock Now Button */}
                    <TouchableOpacity
                      style={styles.lockActionBtn}
                      onPress={handleSaveAndLock}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                      <Text style={styles.lockActionBtnText}>Lock App Now</Text>
                    </TouchableOpacity>

                    {/* Switch to Configure */}
                    <TouchableOpacity
                      style={styles.secondaryTextBtn}
                      onPress={() => {
                        setPinInput(currentPin || "");
                        setConfirmPinInput(currentPin || "");
                        setMode("configure");
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil" size={14} color="#64748B" />
                      <Text style={styles.secondaryTextBtnText}>Change Document or 4-Digit PIN</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Configure Mode */
                  <View style={styles.configureSection}>
                    {/* Step 1: Choose Document */}
                    <Text style={styles.sectionHeading}>1. Choose Decoy Document (Image or PDF)</Text>
                    <Text style={styles.sectionDesc}>
                      Upload your own photo or PDF to display as a disguise when locked.
                    </Text>

                    {/* Upload Action Buttons */}
                    <View style={styles.uploadButtonsRow}>
                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={handlePickImage}
                        disabled={pickingFile}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.uploadBtnIcon, { backgroundColor: "#EFF6FF" }]}>
                          <Ionicons name="image-outline" size={22} color="#2563EB" />
                        </View>
                        <Text style={styles.uploadBtnText}>Upload Image</Text>
                        <Text style={styles.uploadBtnSub}>Gallery / Photos</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={handlePickPdf}
                        disabled={pickingFile}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.uploadBtnIcon, { backgroundColor: "#F5F3FF" }]}>
                          <Ionicons name="document-text-outline" size={22} color="#7C3AED" />
                        </View>
                        <Text style={styles.uploadBtnText}>Upload PDF</Text>
                        <Text style={styles.uploadBtnSub}>Files / Storage</Text>
                      </TouchableOpacity>
                    </View>

                    {pickingFile && (
                      <View style={styles.pickingRow}>
                        <ActivityIndicator size="small" color="#7C3AED" />
                        <Text style={styles.pickingText}>Loading selected document...</Text>
                      </View>
                    )}

                    {/* Uploaded Document Status / Card */}
                    {selectedDoc ? (
                      <View style={styles.selectedDocWrapper}>
                        <View style={styles.selectedDocCard}>
                          <View
                            style={[
                              styles.selectedDocIconBox,
                              selectedDoc.type === "image"
                                ? { backgroundColor: "#EFF6FF" }
                                : { backgroundColor: "#F5F3FF" },
                            ]}
                          >
                            <Ionicons
                              name={selectedDoc.type === "image" ? "image" : "document-text"}
                              size={22}
                              color={selectedDoc.type === "image" ? "#2563EB" : "#7C3AED"}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.selectedDocName} numberOfLines={1}>
                              {selectedDoc.name}
                            </Text>
                            <Text style={styles.selectedDocSub}>
                              {selectedDoc.type === "image" ? "Custom Image Ready" : "Custom PDF Ready"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.removeDocBtn}
                            onPress={() => setSelectedDoc(null)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Remove document"
                          >
                            <Ionicons name="close-circle" size={22} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>

                        {/* Live Visual Preview */}
                        <View style={styles.livePreviewContainer}>
                          <View style={styles.livePreviewHeader}>
                            <View style={styles.livePreviewHeaderDot} />
                            <Text style={styles.livePreviewTitle}>Preview of Uploaded Disguise</Text>
                            <View style={styles.livePreviewBadge}>
                              <Text style={styles.livePreviewBadgeText}>
                                {selectedDoc.type === "image" ? "Photo Disguise" : "PDF Disguise"}
                              </Text>
                            </View>
                          </View>

                          {selectedDoc.type === "image" ? (
                            <View style={styles.previewImageCard}>
                              <Image
                                source={{ uri: selectedDoc.uri }}
                                style={styles.previewImageThumb}
                                contentFit="cover"
                                transition={200}
                              />
                              <View style={styles.previewImageOverlayBar}>
                                <Ionicons name="eye-outline" size={13} color="#FFFFFF" />
                                <Text style={styles.previewImageOverlayText}>
                                  This image will disguise the screen when locked
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.previewDocSheet}>
                              <View style={styles.previewDocHeaderRow}>
                                <View style={styles.previewDocIconWrap}>
                                  <Ionicons name="document-text" size={20} color="#DC2626" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.previewDocName} numberOfLines={1}>
                                    {selectedDoc.name}
                                  </Text>
                                  <Text style={styles.previewDocSub}>
                                    Official Document • Read Only Disguise
                                  </Text>
                                </View>
                                <View style={styles.pdfTag}>
                                  <Text style={styles.pdfTagText}>PDF</Text>
                                </View>
                              </View>

                              {/* Authentic Document Visual Preview Rows */}
                              <View style={styles.docPreviewPaper}>
                                <View style={styles.docSkeletonLineLarge} />
                                <View style={styles.docSkeletonLineMed} />
                                <View style={styles.docSkeletonLineFull} />
                                <View style={styles.docSkeletonLineFull} />
                                <View style={styles.docSkeletonLineThreeFourth} />

                                <View style={styles.docStampBox}>
                                  <Ionicons name="checkmark-circle" size={14} color="#15803D" />
                                  <Text style={styles.docStampText}>
                                    Document Ready for Decoy Mode
                                  </Text>
                                </View>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    ) : (
                      <View style={styles.emptyDocPrompt}>
                        <Ionicons name="cloud-upload-outline" size={22} color="#94A3B8" />
                        <Text style={styles.emptyDocPromptText}>
                          Please upload an image or PDF document above to continue.
                        </Text>
                      </View>
                    )}

                    {/* Step 2: Set 4-Digit Security PIN */}
                    <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
                      2. Set 4-Digit Unlock PIN
                    </Text>
                    <Text style={styles.sectionDesc}>
                      This PIN will be required to unlock your chats and restore all tabs.
                    </Text>

                    <View style={styles.pinInputsRow}>
                      <View style={styles.pinInputCol}>
                        <Text style={styles.inputLabel}>4-Digit PIN</Text>
                        <TextInput
                          style={styles.pinTextInput}
                          placeholder="••••"
                          placeholderTextColor="#94A3B8"
                          keyboardType="number-pad"
                          maxLength={4}
                          secureTextEntry
                          value={pinInput}
                          onChangeText={(t) => {
                            setPinInput(t.replace(/[^0-9]/g, ""));
                            setErrorMsg(null);
                          }}
                        />
                      </View>

                      <View style={styles.pinInputCol}>
                        <Text style={styles.inputLabel}>Confirm PIN</Text>
                        <TextInput
                          style={styles.pinTextInput}
                          placeholder="••••"
                          placeholderTextColor="#94A3B8"
                          keyboardType="number-pad"
                          maxLength={4}
                          secureTextEntry
                          value={confirmPinInput}
                          onChangeText={(t) => {
                            setConfirmPinInput(t.replace(/[^0-9]/g, ""));
                            setErrorMsg(null);
                          }}
                        />
                      </View>
                    </View>

                    {/* Panic Back Prevention Security Notice */}
                    <View style={styles.securityAlertBox}>
                      <Ionicons name="warning-outline" size={18} color="#B45309" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.securityAlertTitle}>Panic Sign-Out Security</Text>
                        <Text style={styles.securityAlertText}>
                          If someone presses the back button or tries to escape without the PIN, the app will instantly sign out your account. Even after logging in again, this document remains locked until your 4-digit PIN is entered.
                        </Text>
                      </View>
                    </View>

                    {/* Error Message */}
                    {errorMsg && (
                      <View style={styles.errorBox}>
                        <Ionicons name="alert-circle" size={16} color="#DC2626" />
                        <Text style={styles.errorText}>{errorMsg}</Text>
                      </View>
                    )}

                    {/* Submit Button */}
                    <TouchableOpacity
                      style={styles.lockActionBtn}
                      onPress={handleSaveAndLock}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                      <Text style={styles.lockActionBtnText}>Save & Lock App Now</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalCardWrap: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: "100%",
    maxWidth: 600,
    height: "88%",
    maxHeight: "92%",
    overflow: "hidden",
  },
  keyboardAvoid: {
    flex: 1,
    height: "100%",
  },
  modalCard: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    flexShrink: 0,
  },
  modalHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalHeaderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalBody: {
    flex: 1,
    width: "100%",
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    flexGrow: 1,
  },
  quickLockSection: {
    gap: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 14,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#166534",
  },
  statusBannerDesc: {
    fontSize: 12,
    color: "#15803D",
    marginTop: 2,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  selectedDocCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
  },
  selectedDocIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedDocName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  selectedDocSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  removeDocBtn: {
    padding: 4,
  },
  selectedDocWrapper: {
    gap: 10,
  },
  livePreviewContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 10,
  },
  livePreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  livePreviewHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#7C3AED",
  },
  livePreviewTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    flex: 1,
  },
  livePreviewBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePreviewBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6D28D9",
  },
  previewImageCard: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    position: "relative",
    backgroundColor: "#0F172A",
  },
  previewImageThumb: {
    width: "100%",
    height: 140,
  },
  previewImageOverlayBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingVertical: 5,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewImageOverlayText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  previewDocSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 10,
  },
  previewDocHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewDocIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
  },
  previewDocName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  previewDocSub: {
    fontSize: 10,
    color: "#64748B",
  },
  pdfTag: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pdfTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#DC2626",
  },
  docPreviewPaper: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    gap: 6,
  },
  docSkeletonLineLarge: {
    height: 10,
    backgroundColor: "#CBD5E1",
    borderRadius: 4,
    width: "45%",
    marginBottom: 4,
  },
  docSkeletonLineMed: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    width: "70%",
  },
  docSkeletonLineFull: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    width: "100%",
  },
  docSkeletonLineThreeFourth: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    width: "80%",
  },
  docStampBox: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  docStampText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803D",
  },
  emptyDocPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
  },
  emptyDocPromptText: {
    fontSize: 12,
    color: "#64748B",
    flex: 1,
  },
  activePill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  lockActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  lockActionBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  secondaryTextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  secondaryTextBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  configureSection: {
    gap: 12,
    paddingBottom: 24,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionDesc: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
    marginBottom: 4,
  },
  uploadButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  uploadBtn: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  uploadBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  uploadBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  uploadBtnSub: {
    fontSize: 10,
    color: "#64748B",
  },
  pickingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  pickingText: {
    fontSize: 12,
    color: "#7C3AED",
  },
  pinInputsRow: {
    flexDirection: "row",
    gap: 12,
  },
  pinInputCol: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  pinTextInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 8,
    color: "#0F172A",
  },
  securityAlertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  securityAlertTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
  },
  securityAlertText: {
    fontSize: 11,
    color: "#B45309",
    lineHeight: 15,
    marginTop: 2,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "600",
    flex: 1,
  },
});
