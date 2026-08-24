import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { AssetKind, PhotoView, SurveyStatus } from "@skyarc/shared";
import { LocationPhotoSlots } from "../../../src/components/location-photo-slots";
import { AppText, Button, Input, LoadingScreen } from "../../../src/components/ui";
import { getApiClient } from "../../../src/lib/auth";
import { getFileByteSize } from "../../../src/lib/media";
import { queueAssetUpload, runSync } from "../../../src/sync/engine";
import { colors, spacing } from "../../../src/theme";

interface AssetRow {
  view?: PhotoView;
  url: string | null;
}

export default function EditLocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [road, setRoad] = useState("");
  const [address, setAddress] = useState("");
  const [mountingNotes, setMountingNotes] = useState("");
  const [photos, setPhotos] = useState<Partial<Record<PhotoView, string>>>({});
  const [pendingViews, setPendingViews] = useState<Set<PhotoView>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const client = getApiClient();
      const loc = await client.getLocation(id);
      const data = loc.data as Record<string, unknown>;
      setName(String(data.name ?? ""));
      setRoad(String(data.road ?? ""));
      setAddress(String(data.address ?? ""));
      setMountingNotes(String(data.mountingNotes ?? ""));

      const assetsRes = await client.listAssets(id);
      const assets = assetsRes.data as AssetRow[];
      const byView: Partial<Record<PhotoView, string>> = {};
      for (const asset of assets) {
        if (asset.view && asset.url) {
          byView[asset.view] = asset.url;
        }
      }
      setPhotos(byView);
      setPendingViews(new Set());
    } catch {
      Alert.alert("Error", "Could not load location.");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function handlePhotoCaptured(view: PhotoView, uri: string) {
    setPhotos((prev) => ({ ...prev, [view]: uri }));
    setPendingViews((prev) => new Set(prev).add(view));
  }

  async function save() {
    if (!id || !name.trim()) {
      Alert.alert("Missing data", "Location name is required.");
      return;
    }

    setSaving(true);
    try {
      const client = getApiClient();
      await client.updateLocation(id, {
        name: name.trim(),
        road: road.trim() || undefined,
        address: address.trim() || undefined,
        mountingNotes: mountingNotes.trim() || undefined,
        surveyStatus: SurveyStatus.IN_PROGRESS,
      });

      for (const view of pendingViews) {
        const uri = photos[view];
        if (!uri || uri.startsWith("http")) continue;
        const assetId = randomUUID();
        const byteSize = await getFileByteSize(uri);
        await queueAssetUpload(
          assetId,
          id,
          AssetKind.PHOTO,
          uri,
          "image/webp",
          byteSize,
          undefined,
          view
        );
      }

      await runSync();
      Alert.alert("Saved", "Location and photos updated.");
      router.replace(`/location/${id}`);
    } catch (error) {
      Alert.alert(
        "Save issue",
        error instanceof Error ? error.message : "Some changes may sync when back online."
      );
      router.replace(`/location/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingScreen message="Loading location..." />;

  const hasPhotoChanges = pendingViews.size > 0;

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
          placeholder="Location name"
          style={styles.field}
        />

        <AppText variant="label">Road / area</AppText>
        <Input value={road} onChangeText={setRoad} placeholder="Road or area" style={styles.field} />

        <AppText variant="label">Address</AppText>
        <Input value={address} onChangeText={setAddress} placeholder="Address" style={styles.field} />

        <AppText variant="label">Mounting notes</AppText>
        <Input
          value={mountingNotes}
          onChangeText={setMountingNotes}
          multiline
          placeholder="Mounting details..."
          style={[styles.field, styles.textArea]}
        />

        <LocationPhotoSlots
          photos={photos}
          onPhotoCaptured={handlePhotoCaptured}
          title="Site photos"
        />

        {hasPhotoChanges && (
          <AppText variant="caption" style={styles.pendingHint}>
            {pendingViews.size} photo{pendingViews.size === 1 ? "" : "s"} will upload on save
          </AppText>
        )}

        <Button label="Save changes" onPress={save} loading={saving} disabled={!name.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  field: { marginBottom: spacing.md },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  pendingHint: { marginBottom: spacing.md, color: colors.primary },
});
