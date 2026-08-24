import * as Location from "expo-location";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { AssetKind, PhotoView, SurveyStatus } from "@skyarc/shared";
import { getFileByteSize } from "../../src/lib/media";
import {
  queueAssetUpload,
  queueLocationUpsert,
  queueSurvey,
  queueAnalysis,
  runSync,
} from "../../src/sync/engine";
import { LocationPhotoSlots } from "../../src/components/location-photo-slots";
import { AppText, Button, Input } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";

export default function CreateLocationScreen() {
  const [name, setName] = useState("");
  const [gps, setGps] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);
  const [observation, setObservation] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoView, string>>>({});
  const [loading, setLoading] = useState(false);
  const locationId = useRef(randomUUID()).current;

  useEffect(() => {
    void captureGps();
  }, []);

  async function captureGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setGps({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    } catch {
      // user can retry manually
    }
  }

  const photoCount = Object.keys(photos).length;

  async function submit() {
    if (!name.trim() || !gps) {
      Alert.alert("Missing data", "Name and GPS are required.");
      return;
    }
    setLoading(true);
    try {
      await queueLocationUpsert(locationId, {
        id: locationId,
        name: name.trim(),
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyM: gps.accuracy ?? undefined,
        capturedAt: new Date().toISOString(),
      });

      for (const [view, uri] of Object.entries(photos) as [PhotoView, string][]) {
        const assetId = randomUUID();
        const byteSize = await getFileByteSize(uri);
        await queueAssetUpload(
          assetId,
          locationId,
          AssetKind.PHOTO,
          uri,
          "image/webp",
          byteSize,
          undefined,
          view
        );
      }

      await queueSurvey(locationId, {
        checklist: {
          gps_captured: true,
          photos_captured: photoCount,
          photo_views: Object.keys(photos),
        },
        freeTextObservation: observation || null,
      });

      await queueAnalysis(locationId);
      await runSync();
      router.replace(`/location/${locationId}`);
    } catch (error) {
      Alert.alert(
        "Saved locally",
        error instanceof Error
          ? `${error.message}. Queued for sync when online.`
          : "Queued for sync when online."
      );
      router.replace(`/location/${locationId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="label">Location name</AppText>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g. H-0165 — Kalawad Road"
          style={styles.field}
        />

        <Button
          label={
            gps
              ? `GPS ✓ ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
              : "Capture GPS"
          }
          variant="secondary"
          onPress={captureGps}
        />

        <LocationPhotoSlots
          photos={photos}
          onPhotoCaptured={(view, uri) => setPhotos((prev) => ({ ...prev, [view]: uri }))}
        />

        <AppText variant="label" style={styles.sectionLabel}>
          Observation (optional)
        </AppText>
        <Input
          value={observation}
          onChangeText={setObservation}
          multiline
          placeholder="Field notes, facing direction, landmarks..."
          style={[styles.field, styles.textArea]}
        />

        <Button
          label="Complete survey"
          onPress={submit}
          loading={loading}
          disabled={!name.trim() || !gps}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  field: { marginBottom: spacing.md },
  sectionLabel: { marginTop: spacing.md },
  textArea: { minHeight: 96, textAlignVertical: "top" },
});
