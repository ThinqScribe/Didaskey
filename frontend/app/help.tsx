import { Linking, Text } from "react-native";
import { Action, Card, Page, ui } from "@/components/ui/Workspace";
import { router } from "expo-router";

export default function Help() {
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  return <Page title="Help with Didaskey" subtitle="A little guidance for your next step.">
    <Card><Text style={ui.heading}>Payment still processing?</Text><Text style={ui.text}>Return to your bookings to check confirmation. Keep your Paystack receipt and reference. Avoid paying twice while a payment is processing.</Text><Action label="View bookings" onPress={() => router.push("/(tabs)/bookings")} /></Card>
    <Card><Text style={ui.heading}>Joining a classroom</Text><Text style={ui.text}>Open a confirmed online booking within its join window. Allow camera and microphone permissions. If your connection drops, reopen the session.</Text></Card>
    <Card><Text style={ui.heading}>Assignments and lesson notes</Text><Text style={ui.text}>Open Learning & messages, choose a session, then select Materials, Assignments, or Notes. Your work remains available after the lesson.</Text><Action label="Open learning space" secondary onPress={() => router.push("/learning")} /></Card>
    <Card><Text style={ui.heading}>Cancellations</Text><Text style={ui.text}>Students can cancel eligible sessions at least 24 hours before the scheduled start. Cancelling a booking does not mean a refund has already been processed; keep the payment reference for follow-up.</Text></Card>
    {supportEmail && <Action label="Email support" onPress={() => { void Linking.openURL(`mailto:${supportEmail}?subject=Didaskey%20support`); }} />}
  </Page>;
}
