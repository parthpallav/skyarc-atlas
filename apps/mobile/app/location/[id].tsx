import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PHOTO_VIEW_LABELS, photoViewSortKey, type PhotoView } from "@skyarc/shared";
import { getApiClient } from "../../src/lib/auth";
import { listLocalLocations } from "../../src/sync/db";
import { runSync } from "../../src/sync/engine";
import { AppText, Badge, Button, Card, LoadingScreen, LocationThumbnail } from "../../src/components/ui";
import { colors, radii, spacing } from "../../src/theme";

interface AssetRow {
  id: string;
  kind: string;
  url: string | null;
  view?: PhotoView;
  viewLabel?: string;
  sortOrder?: number;
}

export default function LocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Record<string, unknown> | null>(null);
  const [score, setScore] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    await runSync();
    try {
      const client = getApiClient();
      const loc = await client.getLocation(id);
      setLocation(loc.data as Record<string, unknown>);
      try {
        const scoreRes = await client.getLocationScore(id);
        setScore(scoreRes.data as Record<string, unknown> | null);
      } catch {
        setScore(null);
      }
      try {
        const assetsRes = await client.listAssets(id);
        setAssets(assetsRes.data as AssetRow[]);
      } catch {
        setAssets([]);
      }
    } catch {
      const local = await listLocalLocations();
      const match = local.find((l: { id: string }) => l.id === id);
      if (match) {
        const payload = JSON.parse(match.payloadJson) as Record<string, unknown>;
        setLocation({
          ...payload,
          id,
          syncState: match.syncState,
        });
      } else {
        setLocation({ id, name: "Location not found", syncState: "UNKNOWN" });
      }
      setScore(null);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function openInMaps() {
    if (location?.latitude == null || location?.longitude == null) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}`,
    });
    if (url) void Linking.openURL(url);
  }

  if (loading) return <LoadingScreen message="Loading location..." />;

  const syncState = location?.syncState as string | undefined;
  const surveyStatus = location?.surveyStatus as string | undefined;
  const sortedAssets = [...assets].sort(
    (a, b) =>
      (a.sortOrder ?? photoViewSortKey(a.view)) -
      (b.sortOrder ?? photoViewSortKey(b.view))
  );
  const coverUrl =
    (location?.coverImageUrl as string | undefined) ??
    sortedAssets.find((a) => a.url)?.url ??
    null;
  const galleryAssets = sortedAssets.filter((a) => a.url);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <LocationThumbnail uri={null} size={120} />
          </View>
        )}
        <View style={styles.heroOverlay}>
          <AppText variant="title" style={styles.heroTitle}>
            {String(location?.name ?? "Location")}
          </AppText>
        </View>
      </View>

      {location?.latitude != null && (
        <Text style={styles.coords}>
          {Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}
        </Text>
      )}

      <View style={styles.badges}>
        {surveyStatus && (
          <Badge
            label={surveyStatus}
            tone={surveyStatus === "SUBMITTED" ? "success" : "muted"}
          />
        )}
        {syncState && syncState !== "UPLOADED" && (
          <Badge label={`Sync: ${syncState}`} tone="warning" />
        )}
      </View>

      {location?.latitude != null && (
        <Text style={styles.mapLink} onPress={openInMaps}>
          Open in Maps →
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label="Edit location & photos"
          variant="secondary"
          onPress={() => router.push(`/location/edit/${id}`)}
        />
      </View>

      {galleryAssets.length > 0 && (
        <>
          <AppText variant="subtitle" style={styles.section}>
            Site photos
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {galleryAssets.map((asset) => (
              <View key={asset.id} style={styles.galleryItem}>
                <Image source={{ uri: asset.url! }} style={styles.galleryThumb} />
                <Text style={styles.galleryLabel}>
                  {asset.viewLabel ?? PHOTO_VIEW_LABELS[asset.view ?? "OTHER"]}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <AppText variant="subtitle" style={styles.section}>
        Intelligence
      </AppText>
      {score ? (
        <View style={styles.cardWrap}>
          <Card>
          <Text style={styles.scoreValue}>
            {String(score.overallScore)}
            <Text style={styles.scoreMax}> / 100</Text>
          </Text>
          <Text style={styles.meta}>Status: {String(score.status)}</Text>
          <Text style={styles.meta}>Confidence: {String(score.overallConfidence)}</Text>
          </Card>
        </View>
      ) : (
        <Text style={styles.meta}>Score not yet computed.</Text>
      )}

      <AppText variant="subtitle" style={styles.section}>
        Details
      </AppText>
      <View style={styles.cardWrap}>
        <Card>
        {(
          [
            ["Road", location?.road],
            ["Address", location?.address],
            ["Notes", location?.mountingNotes],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{String(value ?? "—")}</Text>
          </View>
        ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  hero: {
    height: 200,
    backgroundColor: colors.secondary,
    marginBottom: spacing.md,
    position: "relative",
  },
  heroImage: { width: "100%", height: "100%" },
  heroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  heroTitle: { color: colors.onDark },
  coords: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 4,
    paddingHorizontal: spacing.md,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mapLink: {
    color: colors.primary,
    marginTop: spacing.md,
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: spacing.md,
  },
  actions: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md },
  cardWrap: { paddingHorizontal: spacing.md },
  gallery: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  galleryItem: { marginRight: spacing.sm, width: 120 },
  galleryThumb: {
    width: 120,
    height: 80,
    borderRadius: radii.sm,
    backgroundColor: colors.secondary,
  },
  galleryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
  },
  scoreValue: { fontSize: 32, fontWeight: "700", color: colors.primary },
  scoreMax: { fontSize: 18, color: colors.muted, fontWeight: "400" },
  meta: { color: colors.muted, fontSize: 14, marginTop: 4, paddingHorizontal: spacing.md },
  detailRow: { marginBottom: spacing.md },
  detailLabel: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  detailValue: { color: colors.text, fontSize: 15 },
});
