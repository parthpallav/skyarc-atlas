import { StyleSheet, Text, View } from "react-native";
import { factorBandLabel, factorPitchCaption, scoreBand } from "@skyarc/shared";
import { AppText, Card } from "./ui";
import { colors, radii, spacing } from "../theme";

export interface SiteMetricView {
  factor: string;
  label: string;
  shortLabel: string;
  score: number;
  band: "high" | "medium" | "low";
  clientOutcome: string;
}

export interface SiteInsightsView {
  overallScore: number;
  overallConfidence: number;
  metrics: SiteMetricView[];
  highlights: string[];
  explanationText: string;
}

export interface PlanSummaryView {
  siteCount: number;
  avgOverallScore: number;
  avgVisibility: number;
  avgAwareness: number;
  avgRecallPotential: number;
  avgAudienceReach: number;
  strengths: string[];
}

function bandColor(band: "high" | "medium" | "low") {
  if (band === "high") return colors.success;
  if (band === "medium") return colors.warning;
  return colors.error;
}

export function PlanSummaryCards({ summary }: { summary: PlanSummaryView }) {
  const cards = [
    { label: "Avg visibility", value: summary.avgVisibility },
    { label: "Awareness", value: summary.avgAwareness },
    { label: "Recall potential", value: summary.avgRecallPotential },
    { label: "Audience reach", value: summary.avgAudienceReach },
    { label: "Overall fit", value: summary.avgOverallScore },
  ];

  return (
    <Card style={styles.summaryCard}>
      <AppText variant="subtitle">Client impact summary</AppText>
      <Text style={styles.summaryHint}>
        How this plan drives visibility, awareness, and brand recall.
      </Text>
      <View style={styles.summaryGrid}>
        {cards.map((card) => {
          const band = scoreBand(card.value);
          return (
            <View key={card.label} style={styles.summaryTile}>
              <Text style={styles.summaryTileLabel}>{card.label}</Text>
              <Text style={[styles.summaryTileValue, { color: bandColor(band) }]}>
                {card.value}
              </Text>
              <Text style={styles.summaryTileUnit}>/ 100</Text>
            </View>
          );
        })}
      </View>
      {summary.strengths.map((strength) => (
        <Text key={strength} style={styles.strengthBullet}>
          • {strength}
        </Text>
      ))}
    </Card>
  );
}

export function SiteMetricsBars({ metrics }: { metrics: SiteMetricView[] }) {
  return (
    <View style={styles.metricsGrid}>
      {metrics.map((metric) => (
        <View key={metric.factor} style={styles.metricRow}>
          <View style={styles.metricHeader}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.metricHeaderRight}>
              <Text style={[styles.metricBand, { color: bandColor(metric.band) }]}>
                {factorBandLabel(metric.band)}
              </Text>
              <Text style={[styles.metricScore, { color: bandColor(metric.band) }]}>
                {metric.score}
              </Text>
            </View>
          </View>
          <View style={styles.metricTrack}>
            <View
              style={[
                styles.metricFill,
                { width: `${metric.score}%`, backgroundColor: bandColor(metric.band) },
              ]}
            />
          </View>
          <Text style={styles.metricOutcome}>{factorPitchCaption(metric)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: { marginBottom: spacing.md },
  summaryHint: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryTile: {
    width: "47%",
    backgroundColor: "#F5F3FF",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
    alignItems: "center",
  },
  summaryTileLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    textAlign: "center",
  },
  summaryTileValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  summaryTileUnit: { fontSize: 10, color: colors.muted },
  strengthBullet: { color: colors.text, fontSize: 14, marginTop: 4, lineHeight: 20 },
  metricsGrid: { gap: spacing.sm },
  metricRow: {
    marginBottom: spacing.xs,
    backgroundColor: "#F8F7FC",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.sm,
  },
  metricHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  metricHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  metricLabel: { fontSize: 12, fontWeight: "600", color: colors.text, flex: 1 },
  metricBand: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  metricScore: { fontSize: 12, fontWeight: "700" },
  metricTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  metricFill: { height: "100%", borderRadius: 4 },
  metricOutcome: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 15 },
});
