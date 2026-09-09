import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants";
import { Action, ui } from "@/components/ui/Workspace";

interface Props {
  url: string;
  visible: boolean;
  onSuccess: () => void;
  /**
   * Called only when Paystack itself signals a cancellation (e.g. the user
   * taps "Cancel" inside the Paystack checkout UI).  Closing this modal via
   * the × button does NOT call onCancel — it just hides the modal so the
   * user can retry without losing their booking.
   */
  onCancel: () => void;
  /** Called when the user dismisses the modal without completing payment. */
  onDismiss: () => void;
}

export default function PaystackWebViewModal({
  url,
  visible,
  onSuccess,
  onCancel,
  onDismiss,
}: Props) {
  const [webLoading, setWebLoading] = useState(true);
  const [handled, setHandled] = useState(false);
  const [showContinueButton, setShowContinueButton] = useState(false);
  // Set to true once the WebView has navigated to the Paystack checkout
  // domain so we don't mis-fire on the very first navigation event.
  const initialLoadDone = useRef(false);

  // Reset state every time the modal is (re-)opened.
  useEffect(() => {
    if (visible) {
      setHandled(false);
      setShowContinueButton(false);
      setWebLoading(true);
      initialLoadDone.current = false;
    }
  }, [visible, url]);

  // Android hardware back button — treat the same as the × close button:
  // dismiss the modal but do NOT call onCancel.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!handled) onDismiss();
      return true; // prevent default back navigation
    });
    return () => sub.remove();
  }, [visible, handled, onDismiss]);

  const handleNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (handled) return;
      const navUrl = nav.url ?? "";
      const isCallback = (() => { try { return new URL(navUrl).pathname === "/payment/callback"; } catch { return false; } })();

      // ── Ignore the initial load to the checkout page itself ───────────────
      if (!initialLoadDone.current) {
        if (
          navUrl.includes("checkout.paystack.com") ||
          navUrl.includes("standard.paystack.com")
        ) {
          initialLoadDone.current = true;
        }
        return;
      }

      // ── Success signals ────────────────────────────────────────────────────
      //
      // 1. Our callback_url — Paystack redirects here after a completed
      //    charge.  The WebView intercepts it before the page loads.
      //    Pattern: https://didaskey.app/payment/callback?trxref=...&reference=...
      //
      // 2. Paystack's own /close URL — fired in some Paystack popup flows.
      //
      const isOurCallback = isCallback;
      const isPaystackClose = navUrl.includes("paystack.com/close");

      if (isOurCallback || isPaystackClose) {
        setHandled(true);
        onSuccess();
        return;
      }

      // ── Paystack-side cancellation ─────────────────────────────────────────
      // Only treat as cancel when Paystack itself signals it — not when the
      // user presses our × button (that calls onDismiss, not onCancel).
      const isPaystackCancel =
        navUrl.includes("paystack.com/cancel") ||
        navUrl.includes("didaskey.app/payment/cancel");

      if (isPaystackCancel) {
        setHandled(true);
        onCancel();
      }
    },
    [handled, onSuccess, onCancel]
  );

  // Show a manual "I've paid" button after 30 s as a fallback for async
  // payment flows (bank transfer, USSD) where Paystack may not redirect
  // immediately.
  useEffect(() => {
    if (!webLoading && !handled && visible && url) {
      const timer = setTimeout(() => {
        if (!handled) setShowContinueButton(true);
      }, 30_000);
      return () => clearTimeout(timer);
    }
  }, [webLoading, handled, visible, url]);

  const statusBarHeight =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 50;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      // Prevent the modal from closing on its own — let our × handle it.
      onRequestClose={() => {
        if (!handled) onDismiss();
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        {/* Status bar spacer */}
        <View style={{ height: statusBarHeight, backgroundColor: "#fff" }} />

        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            backgroundColor: "#fff",
          }}
        >
          <Pressable
            onPress={() => { if (!handled) onDismiss(); }}
            hitSlop={10}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={22} color={Colors.charcoal} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 15,
              fontFamily: "sans-bold",
              color: Colors.charcoal,
            }}
          >
            Secure Payment
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* WebView */}
        <View style={{ flex: 1 }}>
          {webLoading && Platform.OS !== "web" && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                backgroundColor: "#fff",
              }}
            >
              <ActivityIndicator size="large" color={Colors.deepTeal} />
              <Text
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  fontFamily: "sans-medium",
                  color: Colors.mutedForeground,
                }}
              >
                Loading secure checkout…
              </Text>
            </View>
          )}

          {Platform.OS === "web" ? <View style={{ padding: 24, gap: 18 }}><Text style={ui.heading}>Complete your secure payment</Text><Text style={ui.text}>Open Paystack in a new tab, complete checkout, then return here to check confirmation.</Text><Action label="Open Paystack checkout" onPress={() => { void Linking.openURL(url); }} /><Action label="Check payment confirmation" secondary onPress={onSuccess} /></View> : <WebView
            source={{ uri: url }}
            onNavigationStateChange={handleNavChange}
            onShouldStartLoadWithRequest={(req) => {
              // Intercept our callback URL — handle it in JS, don't load it.
              if ((() => { try { return ["/payment/callback", "/payment/cancel"].includes(new URL(req.url).pathname); } catch { return false; } })()) {
                if (!handled) {
                  const isSuccess = req.url.includes("/callback");
                  setHandled(true);
                  if (isSuccess) onSuccess();
                  else onCancel();
                }
                return false; // block the WebView from loading this URL
              }
              return true;
            }}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={() => setWebLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            style={{ flex: 1 }}
          />}

          {/* Fallback: user taps this once they know they've paid */}
          {showContinueButton && !handled && (
            <View
              style={{
                position: "absolute",
                bottom: 20,
                left: 20,
                right: 20,
                backgroundColor: Colors.deepTeal,
                borderRadius: 12,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 5,
              }}
            >
              <Pressable
                onPress={() => { setHandled(true); onSuccess(); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons name="checkmark" size={18} color={Colors.white} />
                <Text
                  style={{
                    color: Colors.white,
                    fontSize: 15,
                    fontFamily: "sans-bold",
                  }}
                >
                  I&apos;ve Paid · Continue
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
