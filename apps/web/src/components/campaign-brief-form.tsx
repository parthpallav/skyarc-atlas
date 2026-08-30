"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Layers,
  FileText,
  Target,
  MapPin,
  Clock,
  IndianRupee,
  CheckCircle2,
  Tag,
  ShieldAlert,
} from "lucide-react";
import { formatInr } from "@/lib/format";
import { SAMPLE_CAMPAIGN_BRIEF } from "@skyarc/shared";

export interface StructuredBriefState {
  objective?: string;
  brandCategory?: string;
  targetAudience?: string[];
  geographicFocus?: string[];
  preferredFormats?: string[];
  budget?: number;
  durationDays?: number;
  kpis?: string[];
  constraints?: string[];
  additionalNotes?: string;
}

interface CampaignBriefBuilderProps {
  initialValues?: {
    sourceText?: string;
    structuredRequirements?: StructuredBriefState;
  };
  onChange: (data: {
    sourceText: string;
    structuredRequirements: Record<string, unknown>;
  }) => void;
}

const OBJECTIVE_OPTIONS = [
  "Brand Awareness & Recall",
  "New Product / Store Launch",
  "Footfall & Retail Drive",
  "Festive & Seasonal Offer",
  "Corridor Takeover & Dominance",
  "Event / Entertainment Promotion",
  "Hyperlocal Lead Generation",
];

const CATEGORY_OPTIONS = [
  "Real Estate & Infrastructure",
  "Automobile & Two-Wheelers",
  "Jewelry, Watches & Luxury Retail",
  "FMCG, Food & Beverages",
  "Healthcare, Pharma & Hospitals",
  "Education, Universities & Coaching",
  "Banking, Fintech & Insurance",
  "Fashion, Apparel & Lifestyle",
  "Consumer Electronics & Appliances",
  "Hospitality, Cafes & Restaurants",
  "Entertainment & Media",
  "Corporate & B2B",
  "Other",
];

const AUDIENCE_PRESETS = [
  "Youth & College Students (18–24)",
  "Working Professionals & Corporate (25–45)",
  "High Net-Worth Individuals (HNIs)",
  "Families & Residential Buyers",
  "Daily Commuters & Motorists",
  "Retail & Market Shoppers",
  "Business Owners & Traders",
];

const CORRIDOR_PRESETS = [
  "Kalawad Road",
  "150 Feet Ring Road",
  "Yagnik Road",
  "University Road",
  "Gondal Road",
  "Kotecha Chowk",
  "Indira Circle",
  "Madhapar Chowk",
  "Raiya Road",
  "Crystal Mall Area",
  "Airport Road",
  "Ring Road 2",
];

const FORMAT_PRESETS = [
  "Digital Billboard (DOOH)",
  "Static Billboard / Hoarding",
  "Unipole",
  "Gantry / Overbridge",
  "Bus Queue Shelter (BQS)",
  "Mall Media / Atrium",
  "Kiosk / Standee",
  "Transit / Bus Wrap",
];

const BUDGET_PRESETS = [
  { label: "₹2 Lakh", value: 200000 },
  { label: "₹5 Lakh", value: 500000 },
  { label: "₹10 Lakh", value: 1000000 },
  { label: "₹25 Lakh", value: 2500000 },
  { label: "₹50 Lakh", value: 5000000 },
  { label: "₹1 Crore", value: 10000000 },
];

const DURATION_PRESETS = [
  { label: "7 Days", value: 7 },
  { label: "15 Days", value: 15 },
  { label: "30 Days (1 Month)", value: 30 },
  { label: "45 Days", value: 45 },
  { label: "60 Days (2 Months)", value: 60 },
  { label: "90 Days (Quarter)", value: 90 },
];

const KPI_PRESETS = [
  "Maximum Reach & Impressions",
  "High Frequency & Ad Recall",
  "Corridor Dominance & Impact",
  "Cost-per-day Efficiency",
  "Youth & Student Exposure",
  "Commercial Junction Presence",
];

const CONSTRAINT_PRESETS = [
  "High Visibility Score (> 75) Only",
  "Prime Facing / Unobstructed View Only",
  "Night Illumination Required",
  "No Competitor Adjacency",
  "Minimum Dwell Time > 15s",
];

export function CampaignBriefBuilder({
  initialValues,
  onChange,
}: CampaignBriefBuilderProps) {
  const [mode, setMode] = useState<"guided" | "raw">("guided");

  const [objective, setObjective] = useState(
    initialValues?.structuredRequirements?.objective ?? OBJECTIVE_OPTIONS[0]
  );
  const [brandCategory, setBrandCategory] = useState(
    initialValues?.structuredRequirements?.brandCategory ?? CATEGORY_OPTIONS[0]
  );
  const [audiences, setAudiences] = useState<string[]>(
    initialValues?.structuredRequirements?.targetAudience ?? [
      AUDIENCE_PRESETS[1],
      AUDIENCE_PRESETS[2],
    ]
  );
  const [corridors, setCorridors] = useState<string[]>(
    initialValues?.structuredRequirements?.geographicFocus ?? [
      CORRIDOR_PRESETS[0],
      CORRIDOR_PRESETS[1],
    ]
  );
  const [formats, setFormats] = useState<string[]>(
    initialValues?.structuredRequirements?.preferredFormats ?? [
      FORMAT_PRESETS[0],
      FORMAT_PRESETS[1],
      FORMAT_PRESETS[2],
    ]
  );
  const [budget, setBudget] = useState<number>(
    initialValues?.structuredRequirements?.budget ?? 500000
  );
  const [durationDays, setDurationDays] = useState<number>(
    initialValues?.structuredRequirements?.durationDays ?? 30
  );
  const [kpis, setKpis] = useState<string[]>(
    initialValues?.structuredRequirements?.kpis ?? [
      KPI_PRESETS[0],
      KPI_PRESETS[2],
    ]
  );
  const [constraints, setConstraints] = useState<string[]>(
    initialValues?.structuredRequirements?.constraints ?? [
      CONSTRAINT_PRESETS[0],
      CONSTRAINT_PRESETS[2],
    ]
  );
  const [notes, setNotes] = useState(
    initialValues?.structuredRequirements?.additionalNotes ?? ""
  );

  const [rawText, setRawText] = useState(initialValues?.sourceText ?? "");

  // Toggle helpers for multi-select arrays
  const toggleArrayItem = (
    item: string,
    current: string[],
    setter: (val: string[]) => void
  ) => {
    if (current.includes(item)) {
      setter(current.filter((i) => i !== item));
    } else {
      setter([...current, item]);
    }
  };

  // Synthesize brief text from structured state
  const generateSynthesizedText = () => {
    const lines = [
      `# Campaign Brief: ${objective}`,
      `**Industry / Category**: ${brandCategory}`,
      `**Budget**: ${formatInr(budget)} for a ${durationDays}-day flight`,
      `**Target Audience**: ${audiences.join(", ") || "General Public"}`,
      `**Geographic Corridors**: ${corridors.join(", ") || "Citywide"}`,
      `**Preferred Media Formats**: ${formats.join(", ") || "All formats"}`,
      `**Core KPIs**: ${kpis.join(", ") || "Brand awareness"}`,
      `**Constraints / Guardrails**: ${constraints.join(", ") || "None"}`,
    ];
    if (notes.trim()) {
      lines.push(`**Additional Notes**: ${notes.trim()}`);
    }
    return lines.join("\n\n");
  };

  useEffect(() => {
    if (mode === "guided") {
      const structured = {
        objective,
        brandCategory,
        targetAudience: audiences,
        geographicFocus: corridors,
        preferredFormats: formats,
        budget,
        durationDays,
        kpis,
        constraints,
        additionalNotes: notes,
      };
      const text = generateSynthesizedText();
      onChange({
        sourceText: text,
        structuredRequirements: structured,
      });
    } else {
      onChange({
        sourceText: rawText,
        structuredRequirements: {},
      });
    }
  }, [
    mode,
    objective,
    brandCategory,
    audiences,
    corridors,
    formats,
    budget,
    durationDays,
    kpis,
    constraints,
    notes,
    rawText,
  ]);

  return (
    <div className="space-y-6">
      {/* Tab switch between Guided and Raw */}
      <div className="flex items-center justify-between border-b border-violet-100 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("guided")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === "guided"
                ? "bg-primary text-white shadow-sm"
                : "bg-violet-50 text-slate-700 hover:bg-violet-100"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Guided Dropdown Form (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mode === "raw"
                ? "bg-primary text-white shadow-sm"
                : "bg-violet-50 text-slate-700 hover:bg-violet-100"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Freeform Text / AI Prompt
          </button>
        </div>
        <span className="text-xs text-muted">
          {mode === "guided"
            ? "Auto-generates structured requirements & summary"
            : "Parse via LLM prompt"}
        </span>
      </div>

      {mode === "guided" ? (
        <div className="space-y-6">
          {/* Objective & Brand Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                Campaign Objective
              </label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {OBJECTIVE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" />
                Industry / Category
              </label>
              <select
                value={brandCategory}
                onChange={(e) => setBrandCategory(e.target.value)}
                className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Budget & Duration */}
          <div className="bg-violet-50/70 border border-violet-100 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                    Total Campaign Budget (₹)
                  </span>
                  <span className="text-emerald-700 font-bold text-sm">
                    {formatInr(budget)}
                  </span>
                </label>
                <input
                  type="number"
                  min="10000"
                  step="50000"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {BUDGET_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setBudget(p.value)}
                      className={`px-2 py-1 text-xs rounded-md border font-medium transition-all ${
                        budget === p.value
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-white text-slate-700 border-violet-200 hover:bg-violet-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    Flight Duration
                  </span>
                  <span className="text-primary font-bold text-sm">
                    {durationDays} Days
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 font-medium"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setDurationDays(p.value)}
                      className={`px-2 py-1 text-xs rounded-md border font-medium transition-all ${
                        durationDays === p.value
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-slate-700 border-violet-200 hover:bg-violet-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Target Audience (Multi-Select Chips) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Target Audience (Select all that apply)
            </label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_PRESETS.map((aud) => {
                const isSelected = audiences.includes(aud);
                return (
                  <button
                    key={aud}
                    type="button"
                    onClick={() => toggleArrayItem(aud, audiences, setAudiences)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
                      isSelected
                        ? "bg-primary text-white border-primary font-semibold shadow-sm"
                        : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    {aud}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Geographic Corridors (Multi-Select Chips) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Target Corridors & Arterial Roads (Rajkot)
            </label>
            <div className="flex flex-wrap gap-2">
              {CORRIDOR_PRESETS.map((corr) => {
                const isSelected = corridors.includes(corr);
                return (
                  <button
                    key={corr}
                    type="button"
                    onClick={() => toggleArrayItem(corr, corridors, setCorridors)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
                      isSelected
                        ? "bg-violet-800 text-white border-violet-800 font-semibold shadow-sm"
                        : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    {corr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media Formats (Multi-Select Chips) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Preferred Inventory & Media Formats
            </label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_PRESETS.map((fmt) => {
                const isSelected = formats.includes(fmt);
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => toggleArrayItem(fmt, formats, setFormats)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 font-semibold shadow-sm"
                        : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* KPIs & Constraints */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Primary KPIs
              </label>
              <div className="flex flex-wrap gap-1.5">
                {KPI_PRESETS.map((kpi) => {
                  const isSelected = kpis.includes(kpi);
                  return (
                    <button
                      key={kpi}
                      type="button"
                      onClick={() => toggleArrayItem(kpi, kpis, setKpis)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                        isSelected
                          ? "bg-purple-700 text-white border-purple-700 font-medium"
                          : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
                      }`}
                    >
                      {kpi}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                Guardrails & Constraints
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CONSTRAINT_PRESETS.map((c) => {
                  const isSelected = constraints.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleArrayItem(c, constraints, setConstraints)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-all ${
                        isSelected
                          ? "bg-amber-600 text-white border-amber-600 font-medium"
                          : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Additional Notes / Custom Instructions (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g., Prioritize sites near university campuses and Kalawad road commercial hubs."
              className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Auto-Generated Summary Box */}
          <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Structured Brief Ready for Media Planning
              </span>
              <span className="text-[11px] font-semibold text-primary bg-white px-2 py-0.5 rounded-full border border-purple-200">
                100% Deterministic & AI-Compatible
              </span>
            </div>
            <p className="text-xs text-purple-950 leading-relaxed font-mono whitespace-pre-line bg-white/70 p-2.5 rounded-lg border border-purple-100">
              {generateSynthesizedText()}
            </p>
          </div>
        </div>
      ) : (
        /* Raw Text / AI Prompt Mode */
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Paste or write campaign brief in freeform English
          </label>
          <textarea
            className="w-full rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[220px]"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Target audience, budget, duration, objectives, corridors..."
          />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              onClick={() => setRawText(SAMPLE_CAMPAIGN_BRIEF)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Load sample Rajkot FMCG brief
            </button>
            <span className="text-xs text-muted">
              You can parse this text using the AI button on the campaign page.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
