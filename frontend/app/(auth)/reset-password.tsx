import { useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Action, Card, ErrorNotice, Field, Page, ui } from "@/components/ui/Workspace";
import { resetPassword, extractErrorMessage } from "@/lib/api/auth";

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() { setBusy(true); setError(""); try { await resetPassword(token!, password); setSaved(true); } catch(e) { setError(extractErrorMessage(e, "The reset link may have expired. Request a new one.")); } finally { setBusy(false); } }
  return <Page title="A fresh start" subtitle="Choose a new password for Didaskey."><Card>{!token ? <><Text style={ui.text}>Open the link from your password reset email.</Text><Action label="Request a reset link" onPress={() => router.replace("/(auth)/forgot-password")} /></> : saved ? <><Text style={ui.text}>Your password has been updated.</Text><Action label="Sign in" onPress={() => router.replace("/(auth)/sign-in")} /></> : <><Field label="New password (8–72 characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={72} /><Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry /><Action label="Save password" busy={busy} onPress={save} disabled={password.length < 8 || password !== confirm} /></>}<ErrorNotice message={error} /></Card></Page>;
}
