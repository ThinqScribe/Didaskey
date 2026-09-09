import { Text } from "react-native";
import { router } from "expo-router";
import { Action, Card, Page, ui } from "@/components/ui/Workspace";

export default function PaymentCallback() {
  return <Page title="Checking your payment"><Card><Text style={ui.text}>Your payment result is being confirmed. Return to your booking to see its current status.</Text><Action label="View bookings" onPress={() => router.replace("/(tabs)/bookings")} /></Card></Page>;
}
