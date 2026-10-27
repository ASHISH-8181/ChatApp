import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@/components/Icon";
import { Fonts, ThemeColors } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MIN_SCALE = 1.0;
const MAX_SCALE = 3.5;
const SCALE_STEP = 0.25;

interface WallpaperEditorModalProps {
  visible: boolean;
  imageUri: string | null;
  contactName: string;
  contactUsername: string;
  colors: ThemeColors;
  isSaving: boolean;
  onClose: () => void;
  onSave: (params: {
    imageUri: string;
    scale: number;
    translateX: number;
    translateY: number;
  }) => Promise<void>;
}

export function WallpaperEditorModal({
  visible,
  imageUri,
  contactName,
  contactUsername,
  colors,
  isSaving,
  onClose,
  onSave,
}: WallpaperEditorModalProps) {
  const insets = useSafeAreaInsets();

  // ─── state ───────────────────────────────────────────────────────────────────
  const [scale, setScale] = useState(MIN_SCALE);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [showMockBubbles, setShowMockBubbles] = useState(true);

  // Animated values (created once via lazy useState; remounted fresh each open)
  const [scaleAnim] = useState(() => new Animated.Value(MIN_SCALE));
  const [panXAnim] = useState(() => new Animated.Value(0));
  const [panYAnim] = useState(() => new Animated.Value(0));

  // Refs for high-frequency touch callbacks
  const currentScale = useRef(MIN_SCALE);
  const currentPanX = useRef(0);
  const currentPanY = useRef(0);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentScale.current = scale;
    currentPanX.current = translateX;
    currentPanY.current = translateY;
  }, [scale, translateX, translateY]);

  // ─── drag handlers ────────────────────────────────────────────────────────────
  const handleTouchGrant = (evt: GestureResponderEvent) => {
    const t = evt.nativeEvent.touches[0];
    if (t) lastTouchPos.current = { x: t.pageX, y: t.pageY };
  };

  const handleTouchMove = (evt: GestureResponderEvent) => {
    const t = evt.nativeEvent.touches[0];
    if (!t || !lastTouchPos.current) return;

    const deltaX = t.pageX - lastTouchPos.current.x;
    const deltaY = t.pageY - lastTouchPos.current.y;
    lastTouchPos.current = { x: t.pageX, y: t.pageY };

    const maxPanX = (SCREEN_WIDTH * (currentScale.current - 0.8)) / 2;
    const maxPanY = (SCREEN_HEIGHT * (currentScale.current - 0.8)) / 2;

    const nextX = Math.min(Math.max(currentPanX.current + deltaX, -maxPanX), maxPanX);
    const nextY = Math.min(Math.max(currentPanY.current + deltaY, -maxPanY), maxPanY);

    setTranslateX(nextX);
    setTranslateY(nextY);
    panXAnim.setValue(nextX);
    panYAnim.setValue(nextY);
  };

  const handleTouchEnd = () => { lastTouchPos.current = null; };

  // ─── zoom controls ───────────────────────────────────────────────────────────
  const spring = (anim: Animated.Value, to: number) =>
    Animated.spring(anim, { toValue: to, useNativeDriver: false }).start();

  const handleZoomIn = () => {
    const next = Math.min(scale + SCALE_STEP, MAX_SCALE);
    setScale(next);
    spring(scaleAnim, next);
  };

  const handleZoomOut = () => {
    const next = Math.max(scale - SCALE_STEP, MIN_SCALE);
    setScale(next);
    if (next === MIN_SCALE) {
      setTranslateX(0); setTranslateY(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: next, useNativeDriver: false }),
        Animated.spring(panXAnim, { toValue: 0, useNativeDriver: false }),
        Animated.spring(panYAnim, { toValue: 0, useNativeDriver: false }),
      ]).start();
    } else {
      spring(scaleAnim, next);
    }
  };

  const handleReset = () => {
    setScale(MIN_SCALE); setTranslateX(0); setTranslateY(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: MIN_SCALE, useNativeDriver: false }),
      Animated.spring(panXAnim, { toValue: 0, useNativeDriver: false }),
      Animated.spring(panYAnim, { toValue: 0, useNativeDriver: false }),
    ]).start();
  };

  // ─── save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!imageUri || isSaving) return;
    await onSave({
      imageUri,
      scale,
      translateX: translateX / SCREEN_WIDTH,
      translateY: translateY / SCREEN_HEIGHT,
    });
  };

  if (!visible || !imageUri) return null;

  const isDark = colors.isDark;
  const surfaceBg = isDark ? "rgba(13,18,32,0.93)" : "rgba(255,255,255,0.96)";

  // Safe top / bottom with fallbacks for devices without safe-area support in modals
  const safeTop = Math.max(insets.top, Platform.OS === "android" ? 28 : 14);
  const safeBottom = Math.max(insets.bottom, 16);

  // Header + zoom bar together define how much top space they take
  const HEADER_H = 64;
  const ZOOM_H = 52;
  const TOP_BLOCK_H = safeTop + HEADER_H + 8 + ZOOM_H + 8;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* ── Full-screen container ── */}
      <View style={StyleSheet.absoluteFill}>

        {/* ── Wallpaper canvas (touch area for drag) ── */}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouchGrant}
          onResponderMove={handleTouchMove}
          onResponderRelease={handleTouchEnd}
          onResponderTerminate={handleTouchEnd}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { scale: scaleAnim },
                  { translateX: panXAnim },
                  { translateY: panYAnim },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </Animated.View>

          {/* Tint overlay */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? "rgba(10,15,29,0.32)" : "rgba(255,255,255,0.10)" },
            ]}
            pointerEvents="none"
          />

          {/* Mock chat bubbles */}
          {showMockBubbles && (
            <View
              style={[
                StyleSheet.absoluteFill,
                { justifyContent: "center", paddingHorizontal: 16, paddingTop: TOP_BLOCK_H },
              ]}
              pointerEvents="none"
            >
              <View style={[styles.datePill, {
                backgroundColor: isDark ? "rgba(19,25,41,0.80)" : "rgba(255,255,255,0.90)",
              }]}>
                <Text style={[styles.datePillText, { color: colors.textSecondary }]}>TODAY</Text>
              </View>

              <View style={[styles.bubble, styles.bubbleLeft, {
                backgroundColor: colors.bubbleReceived,
                borderColor: colors.bubbleReceivedBorder,
                borderWidth: 1,
              }]}>
                <Text style={[styles.bubbleText, { color: colors.bubbleReceivedText }]}>
                  Hey {contactName || "there"}! How does this wallpaper look? ✨
                </Text>
                <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>10:42 AM</Text>
              </View>

              <View style={[styles.bubble, styles.bubbleRight, { backgroundColor: colors.primary }]}>
                <Text style={[styles.bubbleText, { color: "#FFF" }]}>
                  Looks incredible! Perfect framing 👌
                </Text>
                <View style={styles.bubbleMeta}>
                  <Text style={[styles.bubbleTime, { color: "rgba(255,255,255,0.75)" }]}>10:43 AM</Text>
                  <Ionicons name="checkmark-done" size={13} color="#60A5FA" style={{ marginLeft: 3 }} />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ══ TOP OVERLAY (header + zoom bar) ══ */}
        <View
          style={[styles.topOverlay, { top: safeTop, left: 0, right: 0 }]}
          pointerEvents="box-none"
        >
          {/* Header card */}
          <View style={[styles.headerCard, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
            {/* Close */}
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onClose}
              disabled={isSaving}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Title */}
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                Set Chat Wallpaper
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                Drag to frame • Use controls below to zoom
              </Text>
            </View>

            {/* Preview toggle */}
            <TouchableOpacity
              style={[
                styles.iconBtn,
                showMockBubbles && { backgroundColor: `${colors.primary}22` },
              ]}
              onPress={() => setShowMockBubbles((v) => !v)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showMockBubbles ? "eye" : "eye-off-outline"}
                size={20}
                color={showMockBubbles ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Zoom toolbar */}
          <View style={styles.zoomRow}>
            <View style={[styles.zoomBar, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
              {/* Zoom out */}
              <TouchableOpacity
                style={[styles.zoomBtn, scale <= MIN_SCALE && { opacity: 0.35 }]}
                onPress={handleZoomOut}
                disabled={scale <= MIN_SCALE || isSaving}
                activeOpacity={0.7}
              >
                <Ionicons name="remove-circle-outline" size={26} color={colors.textPrimary} />
              </TouchableOpacity>

              {/* Zoom % */}
              <View style={[styles.zoomPill, {
                backgroundColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
              }]}>
                <Ionicons name="search-outline" size={12} color={colors.textSecondary} />
                <Text style={[styles.zoomPct, { color: colors.textPrimary }]}>
                  {Math.round(scale * 100)}%
                </Text>
              </View>

              {/* Zoom in */}
              <TouchableOpacity
                style={[styles.zoomBtn, scale >= MAX_SCALE && { opacity: 0.35 }]}
                onPress={handleZoomIn}
                disabled={scale >= MAX_SCALE || isSaving}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={26} color={colors.textPrimary} />
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Reset */}
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={handleReset}
                disabled={isSaving}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.resetText, { color: colors.textSecondary }]}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ══ BOTTOM OVERLAY (footer) ══ */}
        <View
          style={[styles.footerOverlay, { bottom: safeBottom, left: 0, right: 0 }]}
          pointerEvents="box-none"
        >
          <View style={[styles.footerCard, { backgroundColor: surfaceBg, borderColor: colors.border }]}>
            {/* Privacy hint */}
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={12} color={colors.primary} />
              <Text style={[styles.privacyText, { color: colors.textSecondary }]} numberOfLines={1}>
                Visible only to you and @{contactUsername}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
                disabled={isSaving}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={styles.saveBtnText}>Setting...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={19} color="#FFF" />
                    <Text style={styles.saveBtnText}>Set Wallpaper</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Top overlay ───────────────────────────────────────────────────────────
  topOverlay: {
    position: "absolute",
    paddingHorizontal: 12,
    zIndex: 10,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  subtitle: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyRegular,
    marginTop: 1,
    textAlign: "center",
  },

  // ── Zoom bar ─────────────────────────────────────────────────────────────
  zoomRow: {
    alignItems: "center",
    marginTop: 8,
  },
  zoomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    gap: 2,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  zoomPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 64,
    justifyContent: "center",
    gap: 4,
  },
  zoomPct: {
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 6,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  resetText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
  },

  // ── Bottom overlay ────────────────────────────────────────────────────────
  footerOverlay: {
    position: "absolute",
    paddingHorizontal: 12,
    zIndex: 10,
  },
  footerCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    gap: 5,
  },
  privacyText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    elevation: 4,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  saveBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontFamily: Fonts.bold,
  },

  // ── Mock bubbles ──────────────────────────────────────────────────────────
  datePill: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  datePillText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    letterSpacing: 0.5,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 18,
    marginBottom: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bubbleLeft: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  bubbleRight: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 19,
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: Fonts.bodyRegular,
    marginTop: 3,
    alignSelf: "flex-end",
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 3,
  },
});
