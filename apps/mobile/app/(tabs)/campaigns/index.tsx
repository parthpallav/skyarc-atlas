import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApiClient } from "../../../src/lib/auth";
import { AppText, Badge, LoadingScreen } from "../../../src/components/ui";
import { colors, radii, spacing } from "../../../src/theme";

interface CampaignRow {
  id: string;
  name: string;
  createdAt: string;
  advertiser?: { name: string };
  brief?: { parseStatus: string } | null;
  _count?: { mediaPlans: number };
}

export default function CampaignsScreen() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const result = await client.listCampaigns(1, 50);
      setCampaigns(result.data as CampaignRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
      setCampaigns([]);
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
    return <LoadingScreen message="Loading campaigns..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={campaigns}
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
            <AppText variant="subtitle">
              {error ? "Could not load campaigns" : "No campaigns yet"}
            </AppText>
            <AppText variant="caption">
              {error || "Create campaigns from the web dashboard"}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/campaign/${item.id}`)}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {item.advertiser?.name ?? "Advertiser"} ·{" "}
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <View style={styles.badges}>
              <Badge
                label={`Brief: ${item.brief?.parseStatus ?? "NONE"}`}
                tone={item.brief?.parseStatus === "PARSED" ? "success" : "muted"}
              />
              <Badge
                label={`${item._count?.mediaPlans ?? 0} plan(s)`}
                tone="muted"
              />
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  cardMeta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  empty: { alignItems: "center", paddingTop: 60, gap: spacing.sm, paddingHorizontal: spacing.md },
});
