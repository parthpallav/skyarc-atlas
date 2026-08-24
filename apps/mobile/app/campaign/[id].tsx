import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getApiClient } from "../../src/lib/auth";
import { AppText, Badge, LoadingScreen } from "../../src/components/ui";
import { colors, radii, spacing } from "../../src/theme";

interface ParsedBrief {
  targetAudience?: string;
  budget?: number;
  durationDays?: number;
  categories?: string[];
  objectives?: string[];
}

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  location?: { id: string; name: string; road?: string | null };
}

interface MediaPlanRow {
  id: string;
  name: string;
  status: string;
  totalBudget: number | string;
  createdAt: string;
  items?: PlanItemRow[];
  _count?: { items: number };
}

interface CampaignDetail {
  id: string;
  name: string;
  createdAt: string;
  advertiser?: { name: string };
  brief?: {
    sourceText: string | null;
    parseStatus: string;
    structuredRequirementsJson?: ParsedBrief | null;
  } | null;
  mediaPlans?: MediaPlanRow[];
}

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function hasParsedBrief(data?: ParsedBrief | null) {
  if (!data) return false;
  return Boolean(
    data.targetAudience ||
      data.budget ||
      data.durationDays ||
      (data.categories && data.categories.length > 0) ||
      (data.objectives && data.objectives.length > 0)
  );
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const result = await client.getCampaign(id);
      setCampaign(result.data as CampaignDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) return <LoadingScreen message="Loading campaign..." />;

  if (!campaign) {
    return (
      <View style={styles.center}>
        <AppText variant="subtitle">{error || "Campaign not found"}</AppText>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const parsed = campaign.brief?.structuredRequirementsJson;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="title">{campaign.name}</AppText>
      <Text style={styles.meta}>
        {campaign.advertiser?.name ?? "Advertiser"} ·{" "}
        {new Date(campaign.createdAt).toLocaleDateString()}
      </Text>

      <View style={styles.badges}>
        <Badge
          label={`Brief: ${campaign.brief?.parseStatus ?? "NONE"}`}
          tone={campaign.brief?.parseStatus === "PARSED" ? "success" : "muted"}
        />
        <Badge label={`${campaign.mediaPlans?.length ?? 0} plan(s)`} tone="muted" />
      </View>

      <AppText variant="subtitle" style={styles.section}>
        Brief
      </AppText>
      <View style={styles.card}>
        <Text style={styles.body}>
          {campaign.brief?.sourceText?.trim() || "No brief text yet. Add one from the web dashboard."}
        </Text>
      </View>

      {hasParsedBrief(parsed) && (
        <>
          <AppText variant="subtitle" style={styles.section}>
            Parsed requirements
          </AppText>
          <View style={styles.card}>
            {parsed?.targetAudience && (
              <Text style={styles.detailRow}>
                <Text style={styles.detailLabel}>Audience: </Text>
                {parsed.targetAudience}
              </Text>
            )}
            {parsed?.budget != null && (
              <Text style={styles.detailRow}>
                <Text style={styles.detailLabel}>Budget: </Text>
                {formatInr(Number(parsed.budget))}
              </Text>
            )}
            {parsed?.durationDays != null && (
              <Text style={styles.detailRow}>
                <Text style={styles.detailLabel}>Duration: </Text>
                {parsed.durationDays} days
              </Text>
            )}
            {parsed?.categories && parsed.categories.length > 0 && (
              <Text style={styles.detailRow}>
                <Text style={styles.detailLabel}>Categories: </Text>
                {parsed.categories.join(", ")}
              </Text>
            )}
            {parsed?.objectives && parsed.objectives.length > 0 && (
              <View style={styles.objectives}>
                <Text style={styles.detailLabel}>Objectives</Text>
                {parsed.objectives.map((obj) => (
                  <Text key={obj} style={styles.bullet}>
                    • {obj}
                  </Text>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      <AppText variant="subtitle" style={styles.section}>
        Media plans
      </AppText>
      {(campaign.mediaPlans ?? []).length === 0 ? (
        <Text style={styles.muted}>No media plans yet.</Text>
      ) : (
        (campaign.mediaPlans ?? []).map((plan) => (
          <View key={plan.id} style={styles.planCard}>
            <Text style={styles.planTitle}>{plan.name}</Text>
            <Text style={styles.planMeta}>
              {formatInr(Number(plan.totalBudget))} · {plan.status} ·{" "}
              {plan._count?.items ?? plan.items?.length ?? 0} sites
            </Text>
            <Text style={styles.planMeta}>
              {new Date(plan.createdAt).toLocaleString()}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.hint}>
        Edit briefs and generate plans from the web dashboard (Campaigns).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  link: { color: colors.primary, marginTop: spacing.md, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 14, marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  detailRow: { color: colors.text, fontSize: 14, marginBottom: spacing.sm },
  detailLabel: { fontWeight: "600", color: colors.muted },
  objectives: { marginTop: spacing.xs },
  bullet: { color: colors.text, fontSize: 14, marginTop: 4, paddingLeft: spacing.sm },
  muted: { color: colors.muted, fontSize: 14 },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  planMeta: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: spacing.sm },
  planItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  planItemName: { flex: 1, fontSize: 14, color: colors.text },
  planItemBudget: { fontSize: 14, fontWeight: "600", color: colors.text },
  emptyPlan: {
    fontSize: 12,
    color: "#B45309",
    backgroundColor: "#FEF3C7",
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
});
