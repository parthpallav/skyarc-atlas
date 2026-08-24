import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiClient } from "../../../src/lib/auth";
import { listLocalLocations } from "../../../src/sync/db";
import { runSync } from "../../../src/sync/engine";
import { AppText, Badge, Button, LoadingScreen, LocationThumbnail } from "../../../src/components/ui";
import { colors, radii, spacing } from "../../../src/theme";

interface LocationItem {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  surveyStatus?: string;
  road?: string | null;
  syncState?: string;
  coverImageUrl?: string;
}

export default function LocationsScreen() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    await runSync();
    try {
      const client = getApiClient();
      const remote = await client.listLocations(1, 100);
      const items = (
        remote.data as Array<{
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          surveyStatus: string;
          road?: string | null;
          coverImageUrl?: string;
        }>
      ).map((l) => ({
        id: l.id,
        name: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        surveyStatus: l.surveyStatus,
        road: l.road,
        coverImageUrl: l.coverImageUrl,
        syncState: "UPLOADED",
      }));
      setLocations(items);
      setOffline(false);
    } catch {
      const local = await listLocalLocations();
      setLocations(
        local.map((l: { id: string; payloadJson: string; syncState: string }) => {
          const payload = JSON.parse(l.payloadJson) as {
            name?: string;
            latitude?: number;
            longitude?: number;
          };
          return {
            id: l.id,
            name: payload.name ?? "Untitled",
            latitude: payload.latitude,
            longitude: payload.longitude,
            syncState: l.syncState,
          };
        })
      );
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading && !refreshing) {
    return <LoadingScreen message="Loading locations..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.toolbar}>
        <Button label="+ New survey" onPress={() => router.push("/location/create")} />
        {offline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Offline — showing cached data</Text>
          </View>
        )}
      </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="subtitle">No locations yet</AppText>
            <AppText variant="caption">Create your first field survey</AppText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/location/${item.id}`)}
          >
            <LocationThumbnail uri={item.coverImageUrl} size={80} style={styles.thumb} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.surveyStatus ? (
                  <Badge
                    label={item.surveyStatus}
                    tone={item.surveyStatus === "SUBMITTED" ? "success" : "muted"}
                  />
                ) : item.syncState && item.syncState !== "UPLOADED" ? (
                  <Badge label={item.syncState} tone="warning" />
                ) : null}
              </View>
              {item.latitude != null && item.longitude != null && (
                <Text style={styles.coords}>
                  {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                </Text>
              )}
              {item.road && <Text style={styles.road}>{item.road}</Text>}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  toolbar: { padding: spacing.md, paddingBottom: 0, gap: spacing.sm },
  offlineBanner: {
    backgroundColor: "#FEF3C7",
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  offlineText: { color: "#B45309", fontSize: 12, textAlign: "center" },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  thumb: { flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  coords: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 6,
  },
  road: { color: colors.muted, fontSize: 13, marginTop: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: spacing.sm },
});
