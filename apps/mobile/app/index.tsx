import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
// expo-auth-session is loaded lazily (only on native) because it transitively
// requires expo-crypto which needs a native module not present in Expo Go.
import * as WebBrowser from "expo-web-browser";
import {
  useUser as useClerkUser,
  useSSO,
  useClerk,
} from "@clerk/expo";

import { useUser as useAppUser } from "@/store/user-context";
import {
  fetchHealth,
  registerUserProfile,
  loginUser,
  checkClerkUserProfile,
  checkAvailability,
  getServerUrl,
} from "@/services/api";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";

type AuthMode = "login" | "register" | "create-profile";

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      void WebBrowser.warmUpAsync();
      return () => {
        void WebBrowser.coolDownAsync();
      };
    }
  }, []);
}

export default function EntryScreen() {
  useWarmUpBrowser();

  const { currentUser, setCurrentUser, serverUrl, updateServerUrl } = useAppUser();
  const { user: clerkUser, isLoaded: isClerkLoaded, isSignedIn: isClerkSignedIn } = useClerkUser();
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const isClerkReady = Boolean(clerk?.loaded);
  const signIn = clerk?.loaded && clerk?.client ? (clerk.client.signIn as any) : null;
  const signUp = clerk?.loaded && clerk?.client ? (clerk.client.signUp as any) : null;
  const isSignInLoaded = isClerkReady && Boolean(signIn);
  const isSignUpLoaded = isClerkReady && Boolean(signUp);
  const setSignInActive = clerk?.setActive;
  const setSignUpActive = clerk?.setActive;
  const { signOut } = clerk;

  // Redirect if already logged into ChatApp
  useEffect(() => {
    if (currentUser) {
      router.replace("/(tabs)/chats");
    }
  }, [currentUser]);

  const initialUrl = useMemo(() => {
    const resolved = getServerUrl();
    if (Platform.OS === "android" && (serverUrl.includes("localhost") || serverUrl.includes("127.0.0.1"))) {
      return resolved;
    }
    return serverUrl;
  }, [serverUrl]);

  const [mode, setMode] = useState<AuthMode>("login");

  // Direct login with username/phone/email and password
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Email Sign-Up fields (Clerk OTP)
  const [signUpEmail, setSignUpEmail] = useState("");
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [isExistingAccountSignIn, setIsExistingAccountSignIn] = useState(false);

  // Profile creation fields (after Google or Email Sign-Up)
  const [profileName, setProfileName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePhone, setProfilePhone] = useState(""); // exactly 10 digits
  const [profilePassword, setProfilePassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [showProfilePassword, setShowProfilePassword] = useState(false);

  // Uniqueness validation states
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneAvailable, setPhoneAvailable] = useState<boolean | null>(null);
  const [phoneValid, setPhoneValid] = useState<boolean | null>(null);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);

  // General loading & message states
  const [loading, setLoading] = useState(false);
  const [checkingClerkStatus, setCheckingClerkStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Server settings
  const [customUrl, setCustomUrl] = useState(initialUrl);
  const [showSettings, setShowSettings] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);
  const [serverCheckResult, setServerCheckResult] = useState<string | null>(null);

  // Cross-platform error popup / alert helper
  const showErrorPopup = (title: string, message: string) => {
    setError(message);
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`${title}\n\n${message}`);
      } else {
        Alert.alert(title, message);
      }
    } else {
      Alert.alert(title, message);
    }
  };

  // Check if signed-in Clerk user has a backend profile
  useEffect(() => {
    let isMounted = true;
    if (isClerkLoaded && isClerkSignedIn && clerkUser && !currentUser) {
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      const displayName =
        clerkUser.fullName ||
        clerkUser.firstName ||
        email?.split("@")[0] ||
        "";

      const checkProfile = async () => {
        try {
          setCheckingClerkStatus(true);
          const check = await checkClerkUserProfile(clerkUser.id, email);
          if (!isMounted) return;

          if (check.exists && check.user) {
            setCurrentUser(check.user);
            router.replace("/(tabs)/chats");
          } else {
            // New user or missing profile: open profile creation
            setMode("create-profile");
            if (displayName) {
              setProfileName((prev) => prev || displayName);
            }
            if (email) {
              const suggested = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
              if (suggested) {
                setProfileUsername((prev) => prev || suggested);
              }
            }
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err.message || "Failed to check existing profile");
          }
        } finally {
          if (isMounted) {
            setCheckingClerkStatus(false);
          }
        }
      };

      void checkProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [isClerkLoaded, isClerkSignedIn, clerkUser, currentUser, setCurrentUser]);

  // Debounced check for unique username
  useEffect(() => {
    const clean = profileUsername.trim().toLowerCase().replace(/^@/, "");
    if (clean.length < 3) {
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await checkAvailability(clean, undefined);
        setUsernameAvailable(res.usernameAvailable);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [profileUsername]);

  // Debounced check for unique & valid 10-digit Indian phone number via Veriphone API
  useEffect(() => {
    const digits = profilePhone.replace(/[^0-9]/g, "");
    if (digits.length !== 10) {
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingPhone(true);
      try {
        const res = await checkAvailability(undefined, digits);
        setPhoneAvailable(res.phoneAvailable);
        setPhoneValid(res.phoneValid ?? null);
        setPhoneMessage(res.phoneMessage ?? null);

        if (res.phoneValid === false) {
          showErrorPopup(
            "Phone Number Not Valid",
            res.phoneMessage || "Phone number is not valid in India according to Veriphone verification."
          );
        } else if (res.phoneAvailable === false) {
          showErrorPopup(
            "Phone Number Already Registered",
            "This mobile number is already registered with another account."
          );
        }
      } catch {
        setPhoneAvailable(null);
        setPhoneValid(null);
        setPhoneMessage(null);
      } finally {
        setCheckingPhone(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [profilePhone]);

  const handleTestConnection = async () => {
    try {
      setCheckingServer(true);
      setServerCheckResult(null);
      updateServerUrl(customUrl);
      const res = await fetchHealth();
      setServerCheckResult(`Connected to ${res.service}`);
    } catch (err: any) {
      setServerCheckResult(`Failed: ${err.message || "Cannot reach server"}`);
    } finally {
      setCheckingServer(false);
    }
  };

  // Auto-complete Clerk sign-up if it has missing requirements (e.g. required username in Clerk)
  useEffect(() => {
    if (isSignUpLoaded && signUp && signUp.status === "missing_requirements") {
      const completeMissing = async () => {
        try {
          const missing = signUp.missingFields || [];
          const updatePayload: any = {};
          if (missing.includes("username")) {
            const emailPrefix = (signUp.emailAddress?.split("@")[0] || signUp.firstName || "user")
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "");
            const randomDigits = Math.floor(1000 + Math.random() * 9000);
            updatePayload.username = `${emailPrefix || "user"}_${randomDigits}`.slice(0, 30);
          }
          if (Object.keys(updatePayload).length > 0 && setSignUpActive) {
            const res = await signUp.update(updatePayload);
            if (res.status === "complete" && res.createdSessionId) {
              await setSignUpActive({ session: res.createdSessionId });
            }
          }
        } catch (err: any) {
          console.warn("[EntryScreen] Failed to auto-complete missing sign-up fields:", err);
        }
      };
      void completeMissing();
    }
  }, [isSignUpLoaded, signUp, setSignUpActive]);

  // Google Sign-In / Sign-Up with Clerk
  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccessInfo(null);
      updateServerUrl(customUrl);

      if (Platform.OS === "web") {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const redirectUrl = `${origin}/sso-callback`;
        const redirectUrlComplete = `${origin}/`;

        if (mode === "register" && isSignUpLoaded && signUp) {
          try {
            await signUp.authenticateWithRedirect({
              strategy: "oauth_google",
              redirectUrl,
              redirectUrlComplete,
            });
            return;
          } catch (signUpErr: any) {
            console.warn("[EntryScreen] Web Google signUp redirect failed, trying signIn:", signUpErr);
          }
        }

        if (!isSignInLoaded || !signIn) {
          setError("Clerk is not ready yet. Please try again.");
          setLoading(false);
          return;
        }

        await signIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl,
          redirectUrlComplete,
        });
        return;
      }

      // Native mobile: use AuthSession & startSSOFlow
      // Dynamic require so expo-crypto (native-only) is not evaluated on module load
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AuthSession = require("expo-auth-session") as typeof import("expo-auth-session");
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "chatapp",
        path: "sso-callback",
      });

      const res = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      const { createdSessionId, setActive, signIn: ssoSignIn, signUp: ssoSignUp } = res;

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        return;
      }

      // 1. If sign-up has missing requirements (e.g. required username in Clerk)
      if (ssoSignUp && ssoSignUp.status === "missing_requirements" && setActive) {
        console.log("[EntryScreen] Google Sign-Up missing fields:", ssoSignUp.missingFields);
        const missing = ssoSignUp.missingFields || [];
        const updatePayload: any = {};

        if (missing.includes("username")) {
          const emailPrefix = (ssoSignUp.emailAddress?.split("@")[0] || ssoSignUp.firstName || "user")
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "");
          const randomDigits = Math.floor(1000 + Math.random() * 9000);
          updatePayload.username = `${emailPrefix || "user"}_${randomDigits}`.slice(0, 30);
        }

        if (Object.keys(updatePayload).length > 0) {
          const updatedSignUp = await ssoSignUp.update(updatePayload);
          if (updatedSignUp.status === "complete" && updatedSignUp.createdSessionId) {
            await setActive({ session: updatedSignUp.createdSessionId });
            return;
          }
        }
      }

      // 2. If signIn is transferable to signUp (user does not exist yet)
      if (ssoSignIn && ssoSignIn.firstFactorVerification?.status === "transferable" && ssoSignUp && setActive) {
        const transferRes = await ssoSignUp.create({ transfer: true });
        if (transferRes.status === "complete" && transferRes.createdSessionId) {
          await setActive({ session: transferRes.createdSessionId });
          return;
        } else if (transferRes.status === "missing_requirements") {
          const missing = transferRes.missingFields || [];
          const updatePayload: any = {};
          if (missing.includes("username")) {
            const emailPrefix = (transferRes.emailAddress?.split("@")[0] || transferRes.firstName || "user")
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "");
            const randomDigits = Math.floor(1000 + Math.random() * 9000);
            updatePayload.username = `${emailPrefix || "user"}_${randomDigits}`.slice(0, 30);
          }
          if (Object.keys(updatePayload).length > 0) {
            const updated = await transferRes.update(updatePayload);
            if (updated.status === "complete" && updated.createdSessionId) {
              await setActive({ session: updated.createdSessionId });
              return;
            }
          }
        }
      }

      setLoading(false);
    } catch (err: any) {
      console.warn("[EntryScreen] Google Auth error:", err);
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Google authentication failed. Please try again.";
      setError(msg);
      setLoading(false);
    }
  };

  // Direct login with username/phone/email and password
  const handlePasswordLogin = async () => {
    setError(null);
    setSuccessInfo(null);
    const cleanId = loginIdentifier.trim();
    const password = loginPassword.trim();

    if (!cleanId) {
      setError("Please enter your username, phone number, or email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      updateServerUrl(customUrl);

      const user = await loginUser(cleanId, password);
      setCurrentUser(user);
      router.replace("/(tabs)/chats");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please verify your details.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Email Sign-Up / Login: Send verification code
  const handleSendEmailCode = async () => {
    if (!isSignUpLoaded) return;
    setError(null);
    setSuccessInfo(null);

    const email = signUpEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      updateServerUrl(customUrl);

      // Attempt creating sign-up or fallback to existing account sign-in
      try {
        await signUp.create({
          emailAddress: email,
        });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setIsExistingAccountSignIn(false);
        setPendingEmailVerification(true);
        setSuccessInfo(`Verification code sent to ${email}`);
      } catch (createErr: any) {
        const isIdentifierExists =
          createErr?.errors?.[0]?.code === "form_identifier_exists" ||
          createErr?.message?.toLowerCase().includes("identifier already exists") ||
          createErr?.message?.toLowerCase().includes("already taken");

        // If email already exists in Clerk, prepare signIn with email OTP
        if (isIdentifierExists && isSignInLoaded && signIn) {
          await signIn.create({ identifier: email });
          const emailFactor = (signIn.supportedFirstFactors || []).find(
            (f: any) => f.strategy === "email_code"
          ) as any;

          if (emailFactor) {
            await signIn.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: emailFactor.emailAddressId,
            });
            setIsExistingAccountSignIn(true);
            setPendingEmailVerification(true);
            setSuccessInfo(`Verification code sent to ${email}`);
            return;
          }
        }

        // If password is required during signup creation, supply background token
        const isPwdRequired =
          createErr?.errors?.[0]?.code === "form_password_missing" ||
          createErr?.message?.toLowerCase().includes("password");
        if (isPwdRequired) {
          const tempPassword = `ChatApp!_${Math.random().toString(36).slice(2)}_${Date.now()}`;
          await signUp.create({
            emailAddress: email,
            password: tempPassword,
          });
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
          setIsExistingAccountSignIn(false);
          setPendingEmailVerification(true);
          setSuccessInfo(`Verification code sent to ${email}`);
          return;
        }

        throw createErr;
      }
    } catch (err: any) {
      console.warn("[EntryScreen] Email code error:", err);
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Failed to send verification code. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 2. Email Sign-Up / Login: Verify code and open profile creation or login
  const handleVerifyEmailCode = async () => {
    setError(null);
    setSuccessInfo(null);

    const code = emailVerificationCode.trim();
    if (!code) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setLoading(true);
      const email = signUpEmail.trim().toLowerCase();
      let sessionId: string | null = null;
      let isVerified = false;

      if (isExistingAccountSignIn && signIn) {
        try {
          if (signIn.status === "complete") {
            isVerified = true;
            sessionId = signIn.createdSessionId;
          } else {
            const res = await signIn.attemptFirstFactor({ strategy: "email_code", code });
            if (
              res.status === "complete" ||
              res.status === "needs_second_factor" ||
              (res as any).firstFactorVerification?.status === "verified"
            ) {
              isVerified = true;
              sessionId = res.createdSessionId;
            }
          }
        } catch (err: any) {
          const isAlreadyVerified =
            err?.errors?.[0]?.code === "verification_already_verified" ||
            err?.message?.toLowerCase().includes("already been verified") ||
            JSON.stringify(err || "").toLowerCase().includes("already been verified");
          if (isAlreadyVerified) {
            isVerified = true;
            sessionId = signIn.createdSessionId || null;
          } else {
            throw err;
          }
        }
      } else if (signUp) {
        try {
          // If already verified previously, proceed immediately
          if ((signUp.verifications?.emailAddress?.status as string) === "verified") {
            isVerified = true;
            sessionId = signUp.createdSessionId || null;
          } else {
            const res = await signUp.attemptEmailAddressVerification({ code });
            if (
              res.status === "complete" ||
              res.status === "missing_requirements" ||
              (res.verifications?.emailAddress?.status as string) === "verified" ||
              (signUp.verifications?.emailAddress?.status as string) === "verified"
            ) {
              isVerified = true;
              sessionId = res.createdSessionId || signUp.createdSessionId || null;
            }
          }
        } catch (err: any) {
          const isAlreadyVerified =
            err?.errors?.[0]?.code === "verification_already_verified" ||
            err?.message?.toLowerCase().includes("already been verified") ||
            JSON.stringify(err || "").toLowerCase().includes("already been verified");
          if (isAlreadyVerified) {
            isVerified = true;
            sessionId = signUp.createdSessionId || null;
          } else {
            throw err;
          }
        }
      }

      if (isVerified) {
        const activateFn = setSignInActive || setSignUpActive;
        if (sessionId && activateFn) {
          try {
            await activateFn({ session: sessionId });
          } catch (e) {
            console.warn("Could not activate session:", e);
          }
        }

        setPendingEmailVerification(false);

        // Check if user already exists in ChatApp database
        try {
          const check = await checkClerkUserProfile(sessionId || "verified", email);
          if (check.exists && check.user) {
            setCurrentUser(check.user);
            router.replace("/(tabs)/chats");
            return;
          }
        } catch {
          // If check error, proceed to create profile
        }

        setMode("create-profile");
      } else {
        setError("Verification code could not be verified. Please check the code or resend.");
      }
    } catch (err: any) {
      console.warn("[EntryScreen] Verify code error:", err);
      const isAlreadyVerified =
        err?.errors?.[0]?.code === "verification_already_verified" ||
        err?.message?.toLowerCase().includes("already been verified") ||
        JSON.stringify(err || "").toLowerCase().includes("already been verified");

      if (isAlreadyVerified) {
        setPendingEmailVerification(false);
        setMode("create-profile");
        return;
      }

      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        "Invalid or expired verification code.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Create Profile after Google or Email Sign-Up
  const handleCreateProfile = async () => {
    setError(null);
    setSuccessInfo(null);

    const cleanName = profileName.trim();
    const cleanUsername = profileUsername.trim().toLowerCase().replace(/^@/, "");
    const cleanDigits = profilePhone.replace(/[^0-9]/g, "");
    const password = profilePassword.trim();
    const confirmPwd = profileConfirmPassword.trim();

    if (!cleanName || cleanName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3) {
      setError("Please choose a username (at least 3 characters).");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }
    if (usernameAvailable === false) {
      setError(`Username "@${cleanUsername}" is already taken. Please pick another.`);
      return;
    }
    if (cleanDigits.length !== 10) {
      showErrorPopup("Invalid Phone Number", "Mobile number must be exactly 10 digits.");
      return;
    }
    if (!/^[6-9]/.test(cleanDigits)) {
      showErrorPopup(
        "Invalid Starting Digit",
        "Mobile number must start with 6, 7, 8, or 9 after +91. Other numbers are not allowed."
      );
      return;
    }
    if (phoneValid === false) {
      showErrorPopup(
        "Phone Number Not Valid",
        phoneMessage || "Phone number is not valid in India according to Veriphone verification."
      );
      return;
    }
    if (phoneAvailable === false) {
      showErrorPopup(
        "Phone Number Unavailable",
        "This mobile number is already registered with another account."
      );
      return;
    }
    if (!password || password.length < 4) {
      setError("App password must be at least 4 characters.");
      return;
    }
    if (password !== confirmPwd) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    try {
      setLoading(true);
      updateServerUrl(customUrl);

      const email =
        clerkUser?.primaryEmailAddress?.emailAddress ||
        signUpEmail.trim().toLowerCase() ||
        null;

      const formattedPhone = "+91" + cleanDigits;

      const user = await registerUserProfile({
        name: cleanName,
        username: cleanUsername,
        phoneNumber: formattedPhone,
        email,
        password: password,
        clerkId: clerkUser?.id || null,
        avatarUrl: clerkUser?.imageUrl || null,
      });

      setCurrentUser(user);
      router.replace("/(tabs)/chats");
    } catch (err: any) {
      console.warn("[EntryScreen] Profile creation error:", err);
      const msg = err.message || "Failed to create profile. Please try again.";
      showErrorPopup("Registration Error", msg);
    } finally {
      setLoading(false);
    }
  };

  // Sign out of Clerk to switch accounts or cancel
  const handleSignOutOfClerk = async () => {
    try {
      setLoading(true);
      await signOut();
      setMode("login");
      setProfileName("");
      setProfileUsername("");
      setProfilePhone("");
      setProfilePassword("");
      setProfileConfirmPassword("");
      setSignUpEmail("");
      setEmailVerificationCode("");
      setPendingEmailVerification(false);
      setIsExistingAccountSignIn(false);
      setError(null);
      setSuccessInfo(null);
    } catch (e: any) {
      console.warn("Sign out error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>💬</Text>
            </View>
            <Text style={styles.appTitle}>ChatApp</Text>
            <Text style={styles.appSubtitle}>Secure Real-Time Messaging</Text>
          </View>

          {/* Main Card */}
          <View style={styles.card}>
            {/* Mode Navigation Tabs (when not in create-profile) */}
            {mode !== "create-profile" ? (
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tab, mode === "login" && styles.activeTab]}
                  onPress={() => {
                    setMode("login");
                    setError(null);
                    setSuccessInfo(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.tabText,
                      mode === "login" && styles.activeTabText,
                    ]}
                  >
                    Log In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tab, mode === "register" && styles.activeTab]}
                  onPress={() => {
                    setMode("register");
                    setError(null);
                    setSuccessInfo(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.tabText,
                      mode === "register" && styles.activeTabText,
                    ]}
                  >
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.profileHeaderBadge}>
                <View style={styles.profileStepPill}>
                  <Text style={styles.profileStepText}>Step 2 of 2</Text>
                </View>
                <Text style={styles.profileTitle}>Create Your Profile</Text>
                <Text style={styles.profileSubtitle}>
                  Choose your unique username, 10-digit mobile number & an app password
                </Text>
              </View>
            )}

            {/* Error & Info Banners */}
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.errorBoxText}>{error}</Text>
              </View>
            )}

            {successInfo && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={16} color="#166534" />
                <Text style={styles.successBoxText}>{successInfo}</Text>
              </View>
            )}

            {checkingClerkStatus && (
              <View style={styles.checkingClerkRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.checkingClerkText}>Checking profile with Clerk...</Text>
              </View>
            )}

            {/* ========================================================= */}
            {/* 1. LOGIN MODE */}
            {/* ========================================================= */}
            {mode === "login" && (
              <View style={styles.form}>
                {/* Google Sign In via Clerk */}
                <TouchableOpacity
                  style={styles.googleButton}
                  onPress={handleGoogleAuth}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-google" size={18} color="#EA4335" />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or log in with password</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Identifier */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Username, Phone, or Email</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="e.g. alex_j, 9876543210, or user@gmail.com"
                      placeholderTextColor="#9CA3AF"
                      value={loginIdentifier}
                      onChangeText={(val) => {
                        setLoginIdentifier(val);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Enter your password"
                      placeholderTextColor="#9CA3AF"
                      value={loginPassword}
                      onChangeText={(val) => {
                        setLoginPassword(val);
                        if (error) setError(null);
                      }}
                      secureTextEntry={!showLoginPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowLoginPassword((prev) => !prev)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showLoginPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color="#64748B"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Submit Login Button */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In to ChatApp</Text>
                  )}
                </TouchableOpacity>

                {/* Switch to SignUp */}
                <View style={styles.switchRow}>
                  <Text style={styles.switchText}>Need an account? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setMode("register");
                      setError(null);
                    }}
                  >
                    <Text style={styles.switchLink}>Sign up here</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ========================================================= */}
            {/* 2. SIGN UP MODE (BOTH GOOGLE & EMAIL CODE OPTIONS) */}
            {/* ========================================================= */}
            {mode === "register" && (
              <View style={styles.form}>
                {!pendingEmailVerification ? (
                  <>
                    {/* OPTION 1: GOOGLE SIGN UP */}
                    <TouchableOpacity
                      style={styles.googleButtonPrimary}
                      onPress={handleGoogleAuth}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="logo-google" size={20} color="#EA4335" />
                      <Text style={styles.googleButtonPrimaryText}>Sign up directly with Google</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or sign up with email</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    {/* OPTION 2: EMAIL SIGN UP WITH OTP */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email Address</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                        <TextInput
                          style={styles.inputWithIcon}
                          placeholder="you@example.com"
                          placeholderTextColor="#9CA3AF"
                          value={signUpEmail}
                          onChangeText={(val) => {
                            setSignUpEmail(val);
                            if (error) setError(null);
                          }}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                      onPress={handleSendEmailCode}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  /* VERIFICATION CODE ENTRY BOX */
                  <View style={styles.otpCard}>
                    <Ionicons name="mail-open-outline" size={36} color={Colors.primary} />
                    <Text style={styles.otpTitle}>Verify Your Email</Text>
                    <Text style={styles.otpSubtitle}>
                      Enter the 6-digit code sent to{"\n"}
                      <Text style={styles.boldText}>{signUpEmail}</Text>
                    </Text>

                    <View style={styles.otpInputWrap}>
                      <TextInput
                        style={styles.otpInput}
                        placeholder="123456"
                        placeholderTextColor="#9CA3AF"
                        value={emailVerificationCode}
                        onChangeText={(val) => {
                          setEmailVerificationCode(val);
                          if (error) setError(null);
                        }}
                        keyboardType="number-pad"
                        maxLength={6}
                        textAlign="center"
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                      onPress={handleVerifyEmailCode}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Verify & Create Profile</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.resendBtn}
                      onPress={() => {
                        setPendingEmailVerification(false);
                        setEmailVerificationCode("");
                        setError(null);
                      }}
                    >
                      <Text style={styles.resendText}>Use a different email</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Switch to Login */}
                <View style={styles.switchRow}>
                  <Text style={styles.switchText}>Already have an account? </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setMode("login");
                      setError(null);
                    }}
                  >
                    <Text style={styles.switchLink}>Log In</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ========================================================= */}
            {/* 3. COMPLETE PROFILE MODE (POST GOOGLE OR EMAIL SIGN-UP) */}
            {/* ========================================================= */}
            {mode === "create-profile" && (
              <View style={styles.form}>
                {/* Active Verified Account Pill */}
                {(clerkUser || signUpEmail) && (
                  <View style={styles.clerkAccountBadge}>
                    <Ionicons name="shield-checkmark" size={16} color="#1E40AF" />
                    <Text style={styles.clerkAccountText} numberOfLines={1}>
                      Verified Email:{" "}
                      <Text style={styles.boldText}>
                        {clerkUser?.primaryEmailAddress?.emailAddress || signUpEmail || "Verified User"}
                      </Text>
                    </Text>
                  </View>
                )}

                {/* Full Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="e.g. Alex Johnson"
                      placeholderTextColor="#9CA3AF"
                      value={profileName}
                      onChangeText={(val) => {
                        setProfileName(val);
                        if (error) setError(null);
                      }}
                      autoCapitalize="words"
                      maxLength={50}
                    />
                  </View>
                </View>

                {/* Username with uniqueness check */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Unique Username</Text>
                    {checkingUsername ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : usernameAvailable === true ? (
                      <Text style={styles.availableText}>✓ Available</Text>
                    ) : usernameAvailable === false ? (
                      <Text style={styles.takenText}>✗ Already taken</Text>
                    ) : (
                      <Text style={styles.labelHint}>Must be unique</Text>
                    )}
                  </View>
                  <View style={styles.inputWithPrefix}>
                    <Text style={styles.inputPrefix}>@</Text>
                    <TextInput
                      style={styles.inputPrefixed}
                      placeholder="alex_j"
                      placeholderTextColor="#9CA3AF"
                      value={profileUsername}
                      onChangeText={(val) => {
                        setProfileUsername(val);
                        setUsernameAvailable(null);
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={30}
                    />
                  </View>
                </View>

                {/* Phone Number: Static +91 with exact 10-digit Indian number & Veriphone verification */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Mobile Number (India)</Text>
                    {checkingPhone ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : profilePhone.length === 10 ? (
                      phoneValid === false ? (
                        <Text style={styles.takenText}>✗ {phoneMessage || "Invalid number"}</Text>
                      ) : phoneAvailable === false ? (
                        <Text style={styles.takenText}>✗ Already registered</Text>
                      ) : phoneValid === true ? (
                        <Text style={styles.availableText}>✓ {phoneMessage || "Valid & Available"}</Text>
                      ) : null
                    ) : profilePhone.length > 0 && !/^[6-9]/.test(profilePhone) ? (
                      <Text style={styles.takenText}>✗ Must start with 6, 7, 8, or 9</Text>
                    ) : (
                      <Text style={styles.labelHint}>
                        {profilePhone.length > 0 ? `${profilePhone.length}/10 digits` : "Starts with 6, 7, 8, or 9"}
                      </Text>
                    )}
                  </View>

                  <View style={styles.phoneInputRow}>
                    {/* Static +91 Prefix */}
                    <View style={styles.staticPrefixBox}>
                      <Text style={styles.flagIcon}>🇮🇳</Text>
                      <Text style={styles.staticPrefixText}>+91</Text>
                    </View>

                    {/* 10-digit Input */}
                    <View style={styles.phoneInputWrap}>
                      <TextInput
                        style={styles.phoneInputText}
                        placeholder="9876543210"
                        placeholderTextColor="#9CA3AF"
                        value={profilePhone}
                        onChangeText={(val) => {
                          const digitsOnly = val.replace(/[^0-9]/g, "").slice(0, 10);
                          if (digitsOnly.length > 0 && !/^[6-9]/.test(digitsOnly)) {
                            showErrorPopup(
                              "Invalid Starting Digit",
                              "Mobile number must start with 6, 7, 8, or 9 after +91. Other numbers are not allowed."
                            );
                            return;
                          }
                          setProfilePhone(digitsOnly);
                          setPhoneAvailable(null);
                          setPhoneValid(null);
                          setPhoneMessage(null);
                          if (error) setError(null);
                        }}
                        keyboardType="number-pad"
                        maxLength={10}
                      />
                    </View>
                  </View>
                  <Text style={styles.fieldNote}>
                    Enter 10 digits starting with 6, 7, 8, or 9 after +91. Validated dynamically via Veriphone API.
                  </Text>
                </View>

                {/* Password for direct future login */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Password for Future Login</Text>
                    <Text style={styles.labelHint}>For direct login</Text>
                  </View>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Create your app password"
                      placeholderTextColor="#9CA3AF"
                      value={profilePassword}
                      onChangeText={(val) => {
                        setProfilePassword(val);
                        if (error) setError(null);
                      }}
                      secureTextEntry={!showProfilePassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowProfilePassword((prev) => !prev)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={showProfilePassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color="#64748B"
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.fieldNote}>
                    You can use this password to log in directly with your username or phone number.
                  </Text>
                </View>

                {/* Confirm Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Re-enter password"
                      placeholderTextColor="#9CA3AF"
                      value={profileConfirmPassword}
                      onChangeText={(val) => {
                        setProfileConfirmPassword(val);
                        if (error) setError(null);
                      }}
                      secureTextEntry={!showProfilePassword}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Submit Profile */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                  onPress={handleCreateProfile}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create Profile & Start Chatting</Text>
                  )}
                </TouchableOpacity>

                {/* Switch Account / Sign out */}
                <TouchableOpacity
                  style={styles.clerkSignOutBtn}
                  onPress={handleSignOutOfClerk}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Ionicons name="log-out-outline" size={16} color="#DC2626" />
                  <Text style={styles.clerkSignOutText}>Sign out / Use Different Account</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Server Settings Collapsible Toggle */}
            <TouchableOpacity
              style={styles.settingsToggle}
              onPress={() => setShowSettings(!showSettings)}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsToggleText}>
                {showSettings ? "Hide Server Settings" : "⚙️ Advanced Server Settings"}
              </Text>
            </TouchableOpacity>

            {showSettings && (
              <View style={styles.settingsPanel}>
                <Text style={styles.settingsLabel}>Backend API URL</Text>
                <TextInput
                  style={styles.settingsInput}
                  value={customUrl}
                  onChangeText={setCustomUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="http://192.168.1.15:3000"
                />
                <View style={styles.settingsRow}>
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestConnection}
                    disabled={checkingServer}
                  >
                    {checkingServer ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.testButtonText}>Test Ping</Text>
                    )}
                  </TouchableOpacity>
                  {serverCheckResult && (
                    <Text
                      style={[
                        styles.testResultText,
                        serverCheckResult.startsWith("Connected")
                          ? styles.testResultSuccess
                          : styles.testResultError,
                      ]}
                      numberOfLines={1}
                    >
                      {serverCheckResult}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Footer */}
          <Text style={styles.footerText}>
            Powered by Clerk Authentication & Real-Time PostgreSQL
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  logoIcon: {
    fontSize: 34,
  },
  appTitle: {
    fontSize: 28,
    fontFamily: Fonts.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 9,
  },
  activeTab: {
    backgroundColor: Colors.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  activeTabText: {
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  googleButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 14,
  },
  googleButtonPrimaryText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  profileHeaderBadge: {
    alignItems: "center",
    marginBottom: 16,
  },
  profileStepPill: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 8,
  },
  profileStepText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#2563EB",
  },
  profileTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  profileSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  clerkAccountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 14,
  },
  clerkAccountText: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: "#1E40AF",
    flex: 1,
  },
  boldText: {
    fontFamily: Fonts.bold,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 16,
  },
  googleButtonText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: "#0F172A",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  dividerText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorBoxText: {
    fontSize: 13,
    color: "#DC2626",
    fontFamily: Fonts.bodyMedium,
    flex: 1,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  successBoxText: {
    fontSize: 13,
    color: "#166534",
    fontFamily: Fonts.bodyMedium,
    flex: 1,
  },
  checkingClerkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  checkingClerkText: {
    fontSize: 12,
    color: Colors.primary,
    fontFamily: Fonts.medium,
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  labelHint: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
  },
  fieldNote: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  availableText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#16A34A",
  },
  takenText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#DC2626",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputWithIcon: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  eyeBtn: {
    padding: 6,
  },
  inputWithPrefix: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  inputPrefix: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.primary,
    marginRight: 4,
  },
  inputPrefixed: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  phoneInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  staticPrefixBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    gap: 6,
  },
  flagIcon: {
    fontSize: 16,
  },
  staticPrefixText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  phoneInputWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  phoneInputText: {
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    width: "100%",
    minHeight: 48,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonDisabled: {
    backgroundColor: "#93C5FD",
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  switchText: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  switchLink: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  otpCard: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 8,
  },
  otpTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginTop: 8,
  },
  otpSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: "center",
    marginVertical: 10,
    lineHeight: 18,
  },
  otpInputWrap: {
    width: "100%",
    alignItems: "center",
    marginBottom: 14,
  },
  otpInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontSize: 24,
    fontFamily: Fonts.bold,
    letterSpacing: 8,
    color: Colors.textPrimary,
    minWidth: 180,
  },
  resendBtn: {
    marginTop: 14,
    paddingVertical: 6,
  },
  resendText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.primary,
  },
  clerkSignOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    paddingVertical: 8,
    gap: 6,
  },
  clerkSignOutText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#DC2626",
  },
  settingsToggle: {
    marginTop: 20,
    alignItems: "center",
    paddingVertical: 4,
  },
  settingsToggleText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  settingsPanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  settingsLabel: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  settingsInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  testButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  testButtonText: {
    fontSize: 12,
    color: Colors.primary,
    fontFamily: Fonts.semiBold,
  },
  testResultText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    flex: 1,
  },
  testResultSuccess: {
    color: Colors.success,
  },
  testResultError: {
    color: Colors.danger,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyMedium,
    textAlign: "center",
    marginTop: 20,
    maxWidth: 320,
  },
});
