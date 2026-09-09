import { useState } from "react";
import { Platform, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { apiClient } from "@/lib/api/client";
import { extractErrorMessage } from "@/lib/api/auth";
import { Action, ui } from "@/components/ui/Workspace";

export function UploadLessonFile({ bookingId, reload }: { bookingId: number; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload() {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/png", "image/jpeg"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 8 * 1024 * 1024) { setError("Choose a file no larger than 8 MB."); return; }
      setBusy(true);
      const form = new FormData();
      if (Platform.OS === "web" && asset.file) form.append("file", asset.file, asset.name);
      else form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
      await apiClient.post(`/learning/bookings/${bookingId}/files`, form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
      await reload();
    } catch (e) { setError(extractErrorMessage(e, "Upload failed. You can safely select the same file and retry.")); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8 }}><Action label="Upload lesson file" secondary busy={busy} onPress={upload} /><Text style={ui.muted}>PDF, PNG or JPEG · up to 8 MB · visible only to this session’s participants and administrators.</Text>{!!error && <Text accessibilityLiveRegion="polite" style={ui.text}>{error}</Text>}</View>;
}

export function DownloadLessonFile({ itemId, filename, mediaType }: { itemId: number; filename: string; mediaType: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const { data } = await apiClient.get(`/learning/files/${itemId}`, { responseType: "arraybuffer", timeout: 60000 });
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([data], { type: mediaType }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
        const file = new File(Paths.cache, filename);
        try { file.write(new Uint8Array(data)); await Sharing.shareAsync(file.uri, { mimeType: mediaType }); }
        finally { if (file.exists) file.delete(); }
      }
    } catch (e) { setError(extractErrorMessage(e, "Could not download this file.")); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 8 }}><Action label="Download lesson file" busy={busy} secondary onPress={download} />{!!error && <Text accessibilityLiveRegion="polite" style={ui.text}>{error}</Text>}</View>;
}
