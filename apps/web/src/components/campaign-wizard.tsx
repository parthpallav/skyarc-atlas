"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  Layers,
  MapPin,
  Target,
  Users,
} from "lucide-react";
import { SAMPLE_CAMPAIGN, corridorsForCity, getMarketCity, listMarketCities, listStates } from "@skyarc/shared";
import { formatInr } from "@/lib/format";
import { addDaysYmd, durationDaysBetween, toIsoDate, todayYmd } from "@/lib/dates";
import { FlightAvailabilityPanel } from "@/components/flight-availability-panel";
import { applyFlightPreset, FlightDateRangeCalendar } from "@/components/flight-calendar";
import { InrInput } from "@/components/inr-input";
import {
  AUDIENCE_PRESETS,
  BUDGET_PRESETS,
  CATEGORY_OPTIONS,
  DURATION_PRESETS,
  FORMAT_PRESETS,
  KPI_PRESETS,
  OBJECTIVE_OPTIONS,
  type StructuredBriefState,
} from "@/components/campaign-brief-form";
import { usePremiumFormats } from "@/hooks/use-premium-formats";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

const SITE_COUNT_PRESETS = [4, 6, 8, 10, 12, 15];

const STEPS = [
  { id: 1, label: "Campaign" },
  { id: 2, label: "Dates & budget" },
  { id: 3, label: "Audience & roads" },
  { id: 4, label: "KPIs & review" },
] as const;

function ChipGroup({
  options,
  selected,
  onToggle,
  activeClass,
  premiumOptions,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  activeClass: string;
  premiumOptions?: Set<string> | ((value: string) => boolean);
}) {
  const isPremium = (option: string) =>
    typeof premiumOptions === "function"
      ? premiumOptions(option)
      : Boolean(premiumOptions?.has(option));

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.includes(option);
        const premium = isPremium(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
              on ? `${activeClass} font-semibold shadow-sm` : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
            }`}
          >
            {on && <CheckCircle2 className="w-3 h-3" />}
            {option}
            {premium ? (
              <span
                className={`rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${
                  on
                    ? "bg-white/25 text-white"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}
              >
                Premium
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function toggle(item: string, current: string[], setter: (next: string[]) => void) {
  setter(current.includes(item) ? current.filter((row) => row !== item) : [...current, item]);
}

export interface CampaignWizardPayload {
  name: string;
  advertiserName: string;
  startDate: string;
  endDate: string;
  briefText: string;
  structuredRequirements: StructuredBriefState;
}

export interface CampaignWizardInitial {
  name?: string;
  advertiserName?: string;
  brandCategory?: string;
  objective?: string;
  startDateYmd?: string;
  endDateYmd?: string;
  budget?: number;
  maxLocations?: number;
  audiences?: string[];
  cities?: string[];
  states?: string[];
  corridors?: string[];
  formats?: string[];
  kpis?: string[];
  constraints?: string[];
  notes?: string;
}

export function CampaignWizard({
  pending,
  error,
  preselectedSiteCount,
  initial,
  submitLabel,
  onSubmit,
}: {
  pending?: boolean;
  error?: string;
  preselectedSiteCount?: number;
  initial?: CampaignWizardInitial;
  submitLabel?: string;
  onSubmit: (payload: CampaignWizardPayload) => void;
}) {
  const { isPremiumFormat } = usePremiumFormats();
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");
  const [name, setName] = useState(initial?.name ?? "");
  const [advertiserName, setAdvertiserName] = useState(initial?.advertiserName ?? "");
  const [brandCategory, setBrandCategory] = useState(initial?.brandCategory ?? CATEGORY_OPTIONS[0]);
  const [objective, setObjective] = useState(initial?.objective ?? OBJECTIVE_OPTIONS[0]);
  const [startDate, setStartDate] = useState(initial?.startDateYmd ?? "");
  const [endDate, setEndDate] = useState(initial?.endDateYmd ?? "");
  const [budget, setBudget] = useState(initial?.budget ?? 500000);
  const [maxLocations, setMaxLocations] = useState(initial?.maxLocations ?? 10);
  const [audiences, setAudiences] = useState<string[]>(initial?.audiences ?? [AUDIENCE_PRESETS[1], AUDIENCE_PRESETS[4]]);
  const defaultCity = getMarketCity().name;
  const [cities, setCities] = useState<string[]>(initial?.cities ?? [defaultCity]);
  const [states, setStates] = useState<string[]>(initial?.states ?? []);
  const [corridors, setCorridors] = useState<string[]>(
    initial?.corridors ?? corridorsForCity(defaultCity).slice(0, 2)
  );
  const [formats, setFormats] = useState<string[]>(initial?.formats ?? [FORMAT_PRESETS[0], FORMAT_PRESETS[1], FORMAT_PRESETS[2]]);
  const [kpis, setKpis] = useState<string[]>(initial?.kpis ?? [KPI_PRESETS[0], KPI_PRESETS[2]]);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const days = durationDaysBetween(startDate, endDate);
  const cityOptions = listMarketCities().map((c) => c.name);
  const stateOptions = listStates();
  const corridorOptions =
    cities.length > 0
      ? [...new Set(cities.flatMap((c) => corridorsForCity(c)))]
      : [...new Set(listMarketCities().flatMap((c) => c.corridors.map((x) => x.name)))];

  function fillSample() {
    const start = todayYmd();
    setName(SAMPLE_CAMPAIGN.name);
    setAdvertiserName(SAMPLE_CAMPAIGN.advertiserName);
    setBrandCategory("FMCG, Food & Beverages");
    setObjective("New Product / Store Launch");
    setStartDate(start);
    setEndDate(addDaysYmd(start, 29));
    setBudget(500000);
    setMaxLocations(10);
    setAudiences([AUDIENCE_PRESETS[0], AUDIENCE_PRESETS[1], AUDIENCE_PRESETS[4]]);
    setCities([defaultCity]);
    setStates([getMarketCity(defaultCity).state]);
    setCorridors(corridorsForCity(defaultCity).slice(0, 3));
    setFormats([FORMAT_PRESETS[0], FORMAT_PRESETS[1], FORMAT_PRESETS[2]]);
    setKpis(["Maximum Reach & Impressions", "Corridor Dominance & Impact"]);
    setNotes("Prioritize junctions with evening traffic and unobstructed approach.");
    setStepError("");
  }

  function structured(): StructuredBriefState {
    return {
      objective,
      brandCategory,
      targetAudience: audiences,
      geographicFocus: corridors,
      cities,
      states,
      preferredFormats: formats,
      budget,
      durationDays: days,
      maxLocations,
      kpis,
      constraints: [],
      additionalNotes: notes.trim() || undefined,
    };
  }

  function briefText() {
    const brief = structured();
    return [
      `# Campaign Brief: ${name || objective}`,
      `**Brand**: ${advertiserName || "—"}`,
      `**Industry / Category**: ${brandCategory}`,
      `**Budget**: ${formatInr(budget)} for a ${days ?? "—"}-day flight`,
      `**Sites**: up to ${maxLocations}`,
      `**Target Audience**: ${audiences.join(", ") || "General Public"}`,
      `**Markets**: ${[
        states.length ? `States: ${states.join(", ")}` : null,
        cities.length ? `Cities: ${cities.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "All markets"}`,
      `**Geographic Corridors**: ${corridors.join(", ") || "Citywide"}`,
      `**Preferred Media Formats**: ${formats.join(", ") || "All formats"}`,
      `**Core KPIs**: ${kpis.join(", ") || "Brand awareness"}`,
      brief.additionalNotes ? `**Additional Notes**: ${brief.additionalNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function validateStep(current: number): string | null {
    if (current === 1) {
      if (!name.trim()) return "Enter a campaign name";
      if (!advertiserName.trim()) return "Enter the brand / client";
    }
    if (current === 2) {
      if (!startDate || !endDate) return "Select campaign start and end dates on the calendar";
      if (!days) return "End date must be on or after the start date";
      if (budget <= 0) return "Enter a campaign budget";
      if (maxLocations < 1) return "Choose how many sites to plan for";
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setStepError(message);
      return;
    }
    setStepError("");
    setStep((current) => Math.min(4, current + 1));
  }

  function handleSubmit() {
    const message = validateStep(1) ?? validateStep(2);
    if (message) {
      setStepError(message);
      setStep(message.includes("date") || message.includes("budget") || message.includes("sites") ? 2 : 1);
      return;
    }
    const startIso = toIsoDate(startDate);
    const endIso = toIsoDate(endDate, true);
    if (!startIso || !endIso) {
      setStepError("Enter start and end dates as dd/mm/yyyy");
      setStep(2);
      return;
    }
    onSubmit({
      name: name.trim(),
      advertiserName: advertiserName.trim(),
      startDate: startIso,
      endDate: endIso,
      briefText: briefText(),
      structuredRequirements: structured(),
    });
  }

  return (
    <div className="card-surface p-5 sm:p-7 space-y-6">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                setStepError("");
                setStep(item.id);
              }}
              className={`w-full text-left rounded-xl px-2 py-2 border ${
                step === item.id
                  ? "border-primary bg-violet-50 text-primary"
                  : item.id < step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-violet-100 text-muted"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide">Step {item.id}</span>
              <span className="block text-xs font-semibold truncate">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>

      {(error || stepError) && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error || stepError}
        </p>
      )}

      {preselectedSiteCount ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {preselectedSiteCount} selected site{preselectedSiteCount === 1 ? "" : "s"} will be reserved for these dates.
        </p>
      ) : null}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Campaign name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer launch — multi-city" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Brand / client</label>
              <input className={inputClass} value={advertiserName} onChange={(e) => setAdvertiserName(e.target.value)} placeholder="e.g. ABC Foods" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-1.5">
                <Target className="w-3.5 h-3.5 text-primary" />
                Campaign objective
              </label>
              <select className={inputClass} value={objective} onChange={(e) => setObjective(e.target.value)}>
                {OBJECTIVE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Industry / category</label>
              <select className={inputClass} value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <FlightDateRangeCalendar
            startDate={startDate}
            endDate={endDate}
            onChange={(nextStart, nextEnd) => {
              setStartDate(nextStart);
              setEndDate(nextEnd);
            }}
          />
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Duration shortcuts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((preset) => {
                const presetRange = applyFlightPreset(startDate, preset.value);
                const active = days === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartDate(presetRange.start);
                      setEndDate(presetRange.end);
                    }}
                    className={`px-2 py-1 text-xs rounded-md border font-medium ${
                      active ? "bg-primary text-white border-primary" : "bg-white text-slate-700 border-violet-200"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <FlightAvailabilityPanel from={startDate} to={endDate} />
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase mb-1.5">
              <span className="flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                Campaign budget
              </span>
              <span className="text-emerald-700">{formatInr(budget)}</span>
            </label>
            <InrInput value={budget} onChange={setBudget} required />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setBudget(preset.value)}
                  className={`px-2 py-1 text-xs rounded-md border font-medium ${
                    budget === preset.value ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-violet-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Preferred number of sites</label>
            <input
              className={inputClass}
              type="number"
              min={1}
              max={50}
              value={maxLocations}
              onChange={(e) => setMaxLocations(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="text-[11px] text-muted mt-1">
              The plan packs as many sites as fit this budget at customer prices. It will not pad or stretch prices to hit this number.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SITE_COUNT_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setMaxLocations(count)}
                  className={`px-2 py-1 text-xs rounded-md border font-medium ${
                    maxLocations === count ? "bg-primary text-white border-primary" : "bg-white text-slate-700 border-violet-200"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              Target audience
            </label>
            <ChipGroup options={AUDIENCE_PRESETS} selected={audiences} onToggle={(item) => toggle(item, audiences, setAudiences)} activeClass="bg-primary text-white border-primary" />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              State
            </label>
            <ChipGroup options={stateOptions} selected={states} onToggle={(item) => toggle(item, states, setStates)} activeClass="bg-cyan-800 text-white border-cyan-800" />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              City
            </label>
            <ChipGroup options={cityOptions} selected={cities} onToggle={(item) => toggle(item, cities, setCities)} activeClass="bg-emerald-700 text-white border-emerald-700" />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Target corridors
            </label>
            <ChipGroup options={corridorOptions} selected={corridors} onToggle={(item) => toggle(item, corridors, setCorridors)} activeClass="bg-violet-800 text-white border-violet-800" />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Preferred formats
            </label>
            <ChipGroup
              options={FORMAT_PRESETS}
              selected={formats}
              onToggle={(item) => toggle(item, formats, setFormats)}
              activeClass="bg-indigo-600 text-white border-indigo-600"
              premiumOptions={isPremiumFormat}
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase mb-2">
              <Target className="w-3.5 h-3.5 text-primary" />
              Primary KPIs
            </label>
            <ChipGroup options={KPI_PRESETS} selected={kpis} onToggle={(item) => toggle(item, kpis, setKpis)} activeClass="bg-purple-700 text-white border-purple-700" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Additional notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Prioritize university campuses and prime commercial hubs."
              className={inputClass}
            />
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3.5 text-sm space-y-1">
            <p className="font-semibold text-slate-900">{name || "Untitled campaign"} · {advertiserName || "Brand"}</p>
            <p className="text-slate-700">{objective}</p>
            <p className="text-slate-700">{formatInr(budget)} · up to {maxLocations} sites · {days ?? "—"} days</p>
            <p className="text-slate-600 text-xs">{audiences.join(" · ") || "Audience not set"}</p>
            <p className="text-slate-600 text-xs">
              {[states.join(", "), cities.join(", "), corridors.join(" · ")]
                .filter((part) => part.trim().length > 0)
                .join(" · ") || "Citywide"}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-violet-100">
        {initial ? (
          <span />
        ) : (
          <button type="button" className="btn-secondary text-xs gap-1.5" onClick={fillSample}>
            <FileText className="w-3.5 h-3.5 text-primary" />
            Fill sample
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {step > 1 && (
            <button type="button" className="btn-secondary" onClick={() => setStep((current) => current - 1)}>
              Back
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn-primary min-w-[120px]" onClick={goNext}>
              Continue
            </button>
          ) : (
            <button type="button" className="btn-primary min-w-[160px]" disabled={pending} onClick={handleSubmit}>
              {pending ? "Saving…" : submitLabel ?? "Save campaign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
