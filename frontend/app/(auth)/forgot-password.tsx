import { useState } from "react";
import { Text } from "react-native";
import { Action, Card, ErrorNotice, Field, Page, ui } from "@/components/ui/Workspace";
import { forgotPassword, extractErrorMessage } from "@/lib/api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function send() { setBusy(true); setError(""); try { await forgotPassword(email.trim()); setSent(true); } catch(e) { setError(extractErrorMessage(e, "Could not send reset instructions.")); } finally { setBusy(false); } }
  return <Page title="Forgot your password?" subtitle="We’ll help you get back to learning."><Card>{sent ? <Text style={ui.text}>If an account exists for this address, password reset instructions are on their way. Check your inbox and spam folder.</Text> : <><Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><Action label="Send reset link" onPress={send} busy={busy} disabled={!email.trim()} /></>}<ErrorNotice message={error} /></Card></Page>;
}
