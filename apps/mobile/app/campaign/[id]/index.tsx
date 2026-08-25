import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiClient } from "../../../src/lib/auth";
import { formatInr } from "../../../src/lib/format";
import { AppText, Badge, Button, Card, Input, LoadingScreen } from "../../../src/components/ui";
import { colors, radii, spacing } from "../../../src/theme";

interface ParsedBrief {
  targetAudience?: string;
  budget?: number;
  durationDays?: number;
  brandCategory?: string;
  geographicFocus?: string[];
  categories?: string[];
  objectives?: string[];
  kpis?: string[];
  constraints?: string[];
}

interface MediaPlanRow {
  id: string;
  name: string;
  status: string;
  totalBudget: number | string;
  createdAt: string;
  _count?: { items: number };
  items?: { id: string }[];
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

function hasParsedBrief(data?: ParsedBrief | null) {
  if (!data) return false;
  return Boolean(
    data.targetAudience ||
      data.budget ||
      data.durationDays ||
      data.brandCategory ||
      (data.geographicFocus && data.geographicFocus.length > 0) ||
      (data.categories && data.categories.length > 0) ||
      (data.objectives && data.objectives.length > 0) ||
      (data.kpis && data.kpis.length > 0) ||
      (data.constraints && data.constraints.length > 0)
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.briefList}>
      <Text style={styles.detailLabel}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.bullet}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <View style={styles.chipRow}>
      {items.map((item) => (
        <View key={item} style={styles.chip}>
          <Text style={styles.chipText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [briefText, setBriefText] = useState("");
  const [budget, setBudget] = useState("500000");
  const [maxLocations, setMaxLocations] = useState("10");
  const [planName, setPlanName] = useState("Optimized Plan");

  const [savingBrief, setSavingBrief] = useState(false);
  const [parsingBrief, setParsingBrief] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const client = getApiClient();
      const result = await client.getCampaign(id);
      const data = result.data as CampaignDetail;
      setCampaign(data);
      if (data.brief?.sourceText) {
        setBriefText(data.brief.sourceText);
      }
      const parsed = data.brief?.structuredRequirementsJson;
      if (parsed?.budget) {
        setBudget(String(parsed.budget));
      }
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

  useEffect(() => {
    if (!campaign?.brief?.sourceText) return;
    setBriefText(campaign.brief.sourceText);
  }, [campaign?.brief?.sourceText]);

  const handleSaveBrief = async () => {
    if (!id) return;
    const text = briefText.trim();
    if (!text) {
      setError("Brief text is required");
      setMessage("");
      return;
    }
    setSavingBrief(true);
    setError("");
    setMessage("");
    try {
      const client = getApiClient();
      await client.updateCampaignBrief(id, text);
      setMessage("Brief saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brief");
    } finally {
      setSavingBrief(false);
    }
  };

  const handleParseBrief = async () => {
    if (!id) return;
    setParsingBrief(true);
    setError("");
    setMessage("");
    try {
      const client = getApiClient();
      await client.parseCampaignBrief(id);
      setMessage("Brief parsed with AI.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brief parsing failed");
    } finally {
      setParsingBrief(false);
    }
  };

  const handleOptimize = async () => {
    if (!id) return;
    const totalBudget = Number(budget);
    const max = maxLocations.trim() ? Number(maxLocations) : undefined;
    if (Number.isNaN(totalBudget) || totalBudget <= 0) {
      setError("Enter a valid budget");
      setMessage("");
      return;
    }
    if (max !== undefined && (Number.isNaN(max) || max <= 0)) {
      setError("Enter a valid max locations");
      setMessage("");
      return;
    }
    setOptimizing(true);
    setError("");
    setMessage("");
    try {
      const client = getApiClient();
      const result = await client.optimizeMediaPlan(id, {
        name: planName.trim() || "Optimized Plan",
        totalBudget,
        maxLocations: max,
      });
      const data = result.data as { plan?: { id?: string; items?: unknown[] } };
      const itemCount = data.plan?.items?.length ?? 0;
      await load();
      if (data.plan?.id) {
        router.push(`/campaign/${id}/plan/${data.plan.id}`);
        return;
      }
      setMessage(
        itemCount > 0
          ? `Media plan created with ${itemCount} site(s).`
          : "Plan created but no sites were allocated."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

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
  const canParse = Boolean(briefText.trim() || campaign.brief?.sourceText);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="title">{campaign.name}</AppText>
      <Text style={styles.meta}>
        {campaign.advertiser?.name ?? "Advertiser"} ·{" "}
        {new Date(campaign.createdAt).toLocaleDateString()}
      </Text>

      {(message || error) && (
        <View style={[styles.banner, error ? styles.bannerError : styles.bannerSuccess]}>
          <Text style={error ? styles.bannerTextError : styles.bannerTextSuccess}>
            {error || message}
          </Text>
        </View>
      )}

      <Card style={styles.sectionCard}>
        <AppText variant="subtitle">Campaign overview</AppText>
        <View style={styles.overviewGrid}>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Advertiser</Text>
            <Text style={styles.overviewValue}>{campaign.advertiser?.name ?? "—"}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Brief status</Text>
            <Text style={styles.overviewValue}>{campaign.brief?.parseStatus ?? "NONE"}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Media plans</Text>
            <Text style={styles.overviewValue}>{campaign.mediaPlans?.length ?? 0}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.overviewValue}>{parsed?.brandCategory ?? "—"}</Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Parsed budget</Text>
            <Text style={styles.overviewValue}>
              {parsed?.budget ? formatInr(Number(parsed.budget)) : "—"}
            </Text>
          </View>
          <View style={styles.overviewItem}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.overviewValue}>
              {parsed?.durationDays ? `${parsed.durationDays} days` : "—"}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <AppText variant="subtitle">Campaign brief</AppText>
          <Badge
            label={campaign.brief?.parseStatus ?? "NONE"}
            tone={campaign.brief?.parseStatus === "PARSED" ? "success" : "muted"}
          />
        </View>
        <Input
          value={briefText}
          onChangeText={setBriefText}
          placeholder="Describe audience, budget, duration, and campaign goals…"
          multiline
          textAlignVertical="top"
          style={styles.briefInput}
        />
        <View style={styles.buttonRow}>
          <View style={styles.buttonFlex}>
            <Button
              label="Save brief"
              variant="secondary"
              onPress={() => void handleSaveBrief()}
              loading={savingBrief}
              disabled={savingBrief}
            />
          </View>
          <View style={styles.buttonFlex}>
            <Button
              label={parsingBrief ? "Parsing…" : "Parse with AI"}
              onPress={() => void handleParseBrief()}
              loading={parsingBrief}
              disabled={parsingBrief || !canParse}
            />
          </View>
        </View>

        {hasParsedBrief(parsed) && (
          <View style={styles.parsedBox}>
            <Text style={styles.parsedTitle}>Parsed requirements</Text>
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
            {parsed?.brandCategory && (
              <Text style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category: </Text>
                {parsed.brandCategory}
              </Text>
            )}
            {parsed?.geographicFocus && parsed.geographicFocus.length > 0 && (
              <View style={styles.chipSection}>
                <Text style={styles.detailLabel}>Geographic focus</Text>
                <ChipRow items={parsed.geographicFocus} />
              </View>
            )}
            {parsed?.categories && parsed.categories.length > 0 && (
              <View style={styles.chipSection}>
                <Text style={styles.detailLabel}>Categories</Text>
                <ChipRow items={parsed.categories} />
              </View>
            )}
            <BriefList title="Objectives" items={parsed?.objectives ?? []} />
            <BriefList title="KPIs" items={parsed?.kpis ?? []} />
            <BriefList title="Constraints" items={parsed?.constraints ?? []} />
          </View>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.optimizeHeader}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <AppText variant="subtitle" style={styles.optimizeTitle}>
            Optimize media plan
          </AppText>
        </View>
        <Text style={styles.optimizeHint}>
          Ranks available inventory by location score and splits your budget across the best sites.
        </Text>
        <Text style={styles.fieldLabel}>Plan name</Text>
        <Input value={planName} onChangeText={setPlanName} style={styles.fieldInput} />
        <Text style={styles.fieldLabel}>Total budget (₹)</Text>
        <Input
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          style={styles.fieldInput}
        />
        <Text style={styles.fieldLabel}>Max locations</Text>
        <Input
          value={maxLocations}
          onChangeText={setMaxLocations}
          keyboardType="numeric"
          style={styles.fieldInput}
        />
        <Button
          label={optimizing ? "Optimizing…" : "Generate media plan"}
          onPress={() => void handleOptimize()}
          loading={optimizing}
          disabled={optimizing}
        />
      </Card>

      <Card style={styles.plansCard}>
        <AppText variant="subtitle" style={styles.plansTitle}>
          Media plans
        </AppText>
        {(campaign.mediaPlans ?? []).length === 0 ? (
          <Text style={styles.muted}>No media plans yet. Run the optimizer above.</Text>
        ) : (
          (campaign.mediaPlans ?? []).map((plan) => (
            <Pressable
              key={plan.id}
              style={styles.planRow}
              onPress={() => router.push(`/campaign/${id}/plan/${plan.id}`)}
            >
              <View style={styles.planRowMain}>
                <Text style={styles.planTitle}>{plan.name}</Text>
                <Text style={styles.planMeta}>
                  {new Date(plan.createdAt).toLocaleString()} ·{" "}
                  {plan._count?.items ?? plan.items?.length ?? 0} sites · {plan.status}
                </Text>
              </View>
              <View style={styles.planRowEnd}>
                <Text style={styles.planBudget}>{formatInr(Number(plan.totalBudget))}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </View>
            </Pressable>
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
  meta: { color: colors.muted, fontSize: 14, marginTop: 4 },
  banner: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  bannerError: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  bannerSuccess: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  bannerTextError: { color: colors.error, fontSize: 14 },
  bannerTextSuccess: { color: colors.success, fontSize: 14 },
  sectionCard: { marginTop: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  overviewItem: { width: "47%" },
  overviewValue: { color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 2 },
  briefInput: { minHeight: 140, marginTop: spacing.sm, marginBottom: spacing.sm },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  buttonFlex: { flex: 1 },
  parsedBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  parsedTitle: { fontWeight: "600", color: colors.text, marginBottom: spacing.sm },
  detailRow: { color: colors.text, fontSize: 14, marginBottom: spacing.sm },
  detailLabel: { fontWeight: "600", color: colors.muted, fontSize: 12, textTransform: "uppercase" },
  briefList: { marginTop: spacing.sm },
  bullet: { color: colors.text, fontSize: 14, marginTop: 4, paddingLeft: spacing.sm },
  chipSection: { marginTop: spacing.sm, marginBottom: spacing.xs },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipText: { fontSize: 12, color: colors.text },
  optimizeHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  optimizeTitle: { marginBottom: 0 },
  optimizeHint: { color: colors.muted, fontSize: 14, marginTop: spacing.sm, marginBottom: spacing.md },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: spacing.xs },
  fieldInput: { marginBottom: spacing.md },
  plansCard: { marginTop: spacing.md, paddingHorizontal: 0, paddingBottom: 0 },
  plansTitle: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  muted: { color: colors.muted, fontSize: 14, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  planRowMain: { flex: 1, minWidth: 0 },
  planRowEnd: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  planTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  planMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  planBudget: { fontSize: 14, fontWeight: "600", color: colors.text },
});
