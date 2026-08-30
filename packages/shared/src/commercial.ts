export const DEFAULT_SKYARC_MARGIN_PERCENT = 15;
export const DEFAULT_CURRENCY = "INR";

export interface OrganizationCommercial {
  /** Skyarc take on vendor rate — admin only. */
  skyarcMarginPercent?: number;
  /** Vendor default margin % applied to all sites unless overridden per location. */
  defaultMarginPercent?: number;
  defaultRateAmount?: number;
  ratePeriod?: string;
  currency?: string;
  paymentTermsDays?: number;
  notes?: string;
}

export interface LocationCommercial {
  /** Site-specific margin % override. */
  marginPercent?: number;
  defaultRateAmount?: number;
  ratePeriod?: string;
  currency?: string;
  paymentTermsDays?: number;
  notes?: string;
}

/** Admin-only customer-facing price for a location (never vendor-derived). */
export interface SkyarcLocationCommercial {
  clientRateAmount?: number;
  ratePeriod?: string;
  currency?: string;
  notes?: string;
}

export interface EffectiveSkyarcLocationCommercial {
  clientRateAmount: number | null;
  ratePeriod: string | null;
  currency: string;
  notes: string | null;
}

export interface EffectiveLocationCommercial {
  marginPercent: number | null;
  defaultRateAmount: number | null;
  ratePeriod: string | null;
  currency: string;
  paymentTermsDays: number | null;
  notes: string | null;
  usesOrgDefaultMargin: boolean;
}

export interface PlatformConfigData {
  defaultSkyarcMarginPercent: number;
  currency: string;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfigData = {
  defaultSkyarcMarginPercent: DEFAULT_SKYARC_MARGIN_PERCENT,
  currency: DEFAULT_CURRENCY,
};

export function parseOrganizationCommercial(
  value: unknown
): OrganizationCommercial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const commercial: OrganizationCommercial = {};
  if (typeof raw.skyarcMarginPercent === "number") {
    commercial.skyarcMarginPercent = raw.skyarcMarginPercent;
  }
  if (typeof raw.defaultMarginPercent === "number") {
    commercial.defaultMarginPercent = raw.defaultMarginPercent;
  }
  if (typeof raw.defaultRateAmount === "number") {
    commercial.defaultRateAmount = raw.defaultRateAmount;
  }
  if (typeof raw.ratePeriod === "string") {
    commercial.ratePeriod = raw.ratePeriod;
  }
  if (typeof raw.currency === "string") {
    commercial.currency = raw.currency;
  }
  if (typeof raw.paymentTermsDays === "number") {
    commercial.paymentTermsDays = raw.paymentTermsDays;
  }
  if (typeof raw.notes === "string") {
    commercial.notes = raw.notes;
  }
  return commercial;
}

export function parseLocationCommercial(value: unknown): LocationCommercial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const commercial: LocationCommercial = {};
  if (typeof raw.marginPercent === "number") {
    commercial.marginPercent = raw.marginPercent;
  }
  if (typeof raw.defaultRateAmount === "number") {
    commercial.defaultRateAmount = raw.defaultRateAmount;
  }
  if (typeof raw.ratePeriod === "string") {
    commercial.ratePeriod = raw.ratePeriod;
  }
  if (typeof raw.currency === "string") {
    commercial.currency = raw.currency;
  }
  if (typeof raw.paymentTermsDays === "number") {
    commercial.paymentTermsDays = raw.paymentTermsDays;
  }
  if (typeof raw.notes === "string") {
    commercial.notes = raw.notes;
  }
  return commercial;
}

export function parseSkyarcLocationCommercial(value: unknown): SkyarcLocationCommercial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const commercial: SkyarcLocationCommercial = {};
  if (typeof raw.clientRateAmount === "number") {
    commercial.clientRateAmount = raw.clientRateAmount;
  }
  if (typeof raw.ratePeriod === "string") {
    commercial.ratePeriod = raw.ratePeriod;
  }
  if (typeof raw.currency === "string") {
    commercial.currency = raw.currency;
  }
  if (typeof raw.notes === "string") {
    commercial.notes = raw.notes;
  }
  return commercial;
}

export function resolveEffectiveSkyarcLocationCommercial(
  skyarcCommercial: SkyarcLocationCommercial,
  platform: PlatformConfigData
): EffectiveSkyarcLocationCommercial {
  return {
    clientRateAmount: skyarcCommercial.clientRateAmount ?? null,
    ratePeriod: skyarcCommercial.ratePeriod ?? null,
    currency: skyarcCommercial.currency ?? platform.currency,
    notes: skyarcCommercial.notes ?? null,
  };
}

export function resolveEffectiveLocationCommercial(
  locationCommercial: LocationCommercial,
  orgCommercial: OrganizationCommercial,
  platform: PlatformConfigData
): EffectiveLocationCommercial {
  const orgCurrency = orgCommercial.currency ?? platform.currency;
  const usesOrgDefaultMargin = locationCommercial.marginPercent == null;
  const marginPercent =
    locationCommercial.marginPercent ?? orgCommercial.defaultMarginPercent ?? null;

  return {
    marginPercent,
    defaultRateAmount:
      locationCommercial.defaultRateAmount ?? orgCommercial.defaultRateAmount ?? null,
    ratePeriod: locationCommercial.ratePeriod ?? orgCommercial.ratePeriod ?? null,
    currency: locationCommercial.currency ?? orgCurrency,
    paymentTermsDays:
      locationCommercial.paymentTermsDays ?? orgCommercial.paymentTermsDays ?? null,
    notes: locationCommercial.notes ?? orgCommercial.notes ?? null,
    usesOrgDefaultMargin,
  };
}

export function parsePlatformConfig(value: unknown): PlatformConfigData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_PLATFORM_CONFIG };
  }
  const raw = value as Record<string, unknown>;
  return {
    defaultSkyarcMarginPercent:
      typeof raw.defaultSkyarcMarginPercent === "number"
        ? raw.defaultSkyarcMarginPercent
        : DEFAULT_PLATFORM_CONFIG.defaultSkyarcMarginPercent,
    currency:
      typeof raw.currency === "string" ? raw.currency : DEFAULT_PLATFORM_CONFIG.currency,
  };
}

/** Effective Skyarc margin % for an org (org override or platform default). */
export function resolveMarginPercent(
  orgCommercial: OrganizationCommercial,
  platform: PlatformConfigData
): number {
  return orgCommercial.skyarcMarginPercent ?? platform.defaultSkyarcMarginPercent;
}

/** Client-facing rate from vendor net rate and margin %. @deprecated Use explicit clientRateAmount instead. */
export function clientRateFromVendorRate(
  vendorRate: number,
  marginPercent: number
): number {
  if (marginPercent <= 0) return vendorRate;
  if (marginPercent >= 100) return vendorRate;
  return vendorRate / (1 - marginPercent / 100);
}

export function skyarcRevenueFromRates(vendorRate: number, clientRate: number): number {
  return Math.max(0, clientRate - vendorRate);
}

/** Informational margin when both vendor net and explicit client price are known. */
export function deriveSkyarcMarginPercent(
  vendorRate: number,
  clientRate: number
): number | null {
  if (clientRate <= 0 || vendorRate < 0 || clientRate <= vendorRate) return null;
  return Math.round(((clientRate - vendorRate) / clientRate) * 1000) / 10;
}
