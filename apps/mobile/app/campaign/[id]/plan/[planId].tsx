import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiClient } from "../../../../src/lib/auth";
import { formatInr } from "../../../../src/lib/format";
import {
  PlanSummaryCards,
  SiteMetricsBars,
  type PlanSummaryView,
  type SiteInsightsView,
} from "../../../../src/components/media-plan-insights";
import {
  AppText,
  Card,
  LoadingScreen,
  LocationThumbnail,
} from "../../../../src/components/ui";
import { colors, radii, spacing } from "../../../../src/theme";

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  explanationText?: string | null;
  location?: {
    id: string;
    name: string;
    road?: string | null;
    coverImageUrl?: string | null;
  };
  insights?: SiteInsightsView;
}

interface MediaPlanDetail {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  _count?: { items: number };
  summary?: PlanSummaryView;
  items: PlanItemRow[];
}

export default function MediaPlanDetailScreen() {
  const { id: campaignId, planId } = useLocalSearchParams<{ id: string; planId: string }>();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [plan, setPlan] = useState<MediaPlanDetail | null>(null);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    if (!campaignId || !planId) return;
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const result = await client.getMediaPlan(campaignId, planId);
      setPlan(result.data as MediaPlanDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media plan");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, planId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleDelete = () => {
    if (!campaignId || !planId || !plan) return;
    Alert.alert(
      "Delete plan",
      `Delete "${plan.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void confirmDelete(),
        },
      ]
    );
  };

  const confirmDelete = async () => {
    if (!campaignId || !planId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const client = getApiClient();
      await client.deleteMediaPlan(campaignId, planId);
      router.replace(`/campaign/${campaignId}`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete plan");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading media plan..." />;

  if (!plan) {
    return (
      <View style={styles.center}>
        <AppText variant="subtitle">{error || "Media plan not found"}</AppText>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const totalAllocated = plan.items.reduce((sum, item) => sum + item.budgetAllocated, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backLink} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={16} color={colors.muted} />
        <Text style={styles.backLinkText}>Campaign</Text>
      </Pressable>

      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <AppText variant="title">{plan.name}</AppText>
          <Text style={styles.meta}>
            {new Date(plan.createdAt).toLocaleString()} · {plan.status}
          </Text>
        </View>
        <Pressable
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.deleteBtnText}>{deleting ? "Deleting…" : "Delete"}</Text>
        </Pressable>
      </View>

      {deleteError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{deleteError}</Text>
        </View>
      ) : null}

      <Card style={styles.statsCard}>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total budget</Text>
            <Text style={styles.statValue}>
              {plan.totalBudget != null ? formatInr(plan.totalBudget) : "—"}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Allocated</Text>
            <Text style={styles.statValue}>{formatInr(totalAllocated)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Sites</Text>
            <Text style={styles.statValue}>{plan._count?.items ?? plan.items.length}</Text>
          </View>
        </View>
      </Card>

      {plan.summary && plan.summary.siteCount > 0 && <PlanSummaryCards summary={plan.summary} />}

      <Card style={styles.sitesCard}>
        <AppText variant="subtitle">Suggested sites & impact</AppText>
        <Text style={styles.sitesHint}>
          Visibility, awareness, recall, and audience reach for each recommended placement.
        </Text>

        {plan.items.length === 0 ? (
          <Text style={styles.emptyPlan}>
            No sites in this plan — inventory needs AVAILABLE status and location scores.
          </Text>
        ) : (
          plan.items.map((item) => (
            <View key={item.id} style={styles.siteRow}>
              <LocationThumbnail uri={item.location?.coverImageUrl} size={80} />
              <View style={styles.siteMain}>
                <View style={styles.siteHeader}>
                  <View style={styles.siteTitleBlock}>
                    <Pressable
                      onPress={() =>
                        item.location?.id && router.push(`/location/${item.location.id}`)
                      }
                    >
                      <Text style={styles.siteTitle} numberOfLines={2}>
                        #{item.rank ?? "—"} {item.location?.name ?? "Unknown site"}
                      </Text>
                    </Pressable>
                    {item.location?.road ? (
                      <Text style={styles.siteRoad} numberOfLines={1}>
                        {item.location.road}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.siteBudgetBlock}>
                    <Text style={styles.siteBudget}>{formatInr(item.budgetAllocated)}</Text>
                    {item.insights ? (
                      <Text style={styles.siteFit}>
                        Fit {Math.round(item.insights.overallScore)}/100
                      </Text>
                    ) : null}
                  </View>
                </View>

                {item.insights ? (
                  <>
                    <SiteMetricsBars metrics={item.insights.metrics} />
                    <Text style={styles.explanation}>
                      {item.explanationText ?? item.insights.explanationText}
                    </Text>
                    {item.location?.id ? (
                      <Pressable
                        style={styles.viewSiteLink}
                        onPress={() => router.push(`/location/${item.location!.id}`)}
                      >
                        <Text style={styles.viewSiteText}>View site details</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
  link: { color: colors.primary, marginTop: spacing.md, fontWeight: "600" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.sm },
  backLinkText: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerMain: { flex: 1, minWidth: 0 },
  meta: { color: colors.muted, fontSize: 14, marginTop: 4 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.error, fontSize: 14 },
  statsCard: { marginBottom: spacing.md },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statItem: { width: "30%", minWidth: 90 },
  statLabel: { fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 4 },
  sitesCard: { marginTop: spacing.xs },
  sitesHint: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  emptyPlan: {
    fontSize: 13,
    color: "#B45309",
    backgroundColor: "#FEF3C7",
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  siteRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  siteMain: { flex: 1, minWidth: 0 },
  siteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  siteTitleBlock: { flex: 1, minWidth: 0 },
  siteTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  siteRoad: { fontSize: 12, color: colors.muted, marginTop: 2 },
  siteBudgetBlock: { alignItems: "flex-end" },
  siteBudget: { fontSize: 14, fontWeight: "700", color: colors.text },
  siteFit: { fontSize: 11, color: colors.muted, marginTop: 2 },
  explanation: { fontSize: 12, color: colors.text, lineHeight: 18, marginTop: spacing.sm },
  viewSiteLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: spacing.sm },
  viewSiteText: { fontSize: 12, fontWeight: "600", color: colors.primary },
});
