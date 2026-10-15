import { z } from "zod";
import {
  AssetKind,
  InventoryStatus,
  InventoryType,
  OrganizationStatus,
  OrganizationType,
  Provenance,
  ScoreStatus,
  ScoringFactor,
  SurveyStatus,
  UploadStatus,
  UserRole,
  AIAnalysisStatus,
  AIOperation,
  PhotoView,
} from "@skyarc/shared";

export const uuidSchema = z.string().uuid();
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(250).default(20),
  scope: z.enum(["mine", "discovery", "all"]).optional(),
  /** Catalog visibility — active (default) excludes hidden/archived sites. */
  visibility: z.enum(["active", "hidden", "all"]).optional().default("active"),
  q: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  /** Flight window for live inventory / digital slot occupancy (YYYY-MM-DD). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Inclusive multi-select geo filters (comma-separated or repeated). */
  cities: z.string().optional(),
  districts: z.string().optional(),
  states: z.string().optional(),
  corridors: z.string().optional(),
});

export const errorDetailSchema = z.object({
  path: z.string().optional(),
  message: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).default([]),
  }),
});

export const metaSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  total: z.number().optional(),
});

export const successResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data,
    meta: metaSchema.default({}),
  });

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  deviceLabel: z.string().optional(),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  organizationId: uuidSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deactivatedAt: z.string().datetime().nullable(),
});

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: z.nativeEnum(OrganizationType),
  status: z.nativeEnum(OrganizationStatus),
  memberCount: z.number().int().nonnegative().optional(),
  locationCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).max(200),
  /** VENDOR (media owner) or CLIENT (brand customer). Default VENDOR for back-compat. */
  type: z.enum([OrganizationType.VENDOR, OrganizationType.CLIENT]).default(OrganizationType.VENDOR),
});

export const updateOrganizationStatusBodySchema = z.object({
  status: z.nativeEnum(OrganizationStatus),
});

export const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.nativeEnum(UserRole),
  organizationId: uuidSchema.optional(),
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  password: z.string().min(8).optional(),
});

export const requestVendorAvailabilityBodySchema = z.object({
  campaignId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
});

export const updateUserMeBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(8).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine(
    (body) => !body.newPassword || Boolean(body.currentPassword),
    { message: "currentPassword is required when setting newPassword", path: ["currentPassword"] }
  );

const marginPercentSchema = z.number().min(0).max(99);

export const vendorCommercialTermsSchema = z.object({
  marginPercent: marginPercentSchema.optional(),
  defaultRateAmount: z.number().positive().optional(),
  ratePeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
});

export const organizationCommercialSchema = z.object({
  skyarcMarginPercent: marginPercentSchema.optional(),
  defaultMarginPercent: marginPercentSchema.optional(),
  defaultRateAmount: z.number().positive().optional(),
  ratePeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateOrganizationCommercialBodySchema = organizationCommercialSchema;

export const updateVendorOrganizationCommercialBodySchema = vendorCommercialTermsSchema
  .omit({ marginPercent: true })
  .extend({
    defaultMarginPercent: marginPercentSchema.optional(),
  });

export const updateLocationCommercialBodySchema = vendorCommercialTermsSchema;

export const bulkApplyLocationCommercialBodySchema = z.object({
  locationIds: z.array(uuidSchema).min(1).max(100),
});

export const siteInterestBodySchema = z.object({
  locationIds: z.array(uuidSchema).min(1).max(100),
});

export const locationPresenceBodySchema = z.object({
  /** Where the explorer is looking — list card vs detail. */
  surface: z.enum(["list", "detail", "map"]).optional(),
});

export const updateSkyarcLocationCommercialBodySchema = z.object({
  clientRateAmount: z.number().positive().optional(),
  ratePeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  notes: z.string().max(2000).optional(),
  /** Customer pitch PREMIUM badge — independent of Skyarc Index. */
  premium: z.boolean().optional(),
});

export const platformConfigBodySchema = z.object({
  defaultSkyarcMarginPercent: marginPercentSchema.optional(),
  currency: z.string().min(3).max(3).optional(),
  showVendorDetailsOnLocationPage: z.boolean().optional(),
  premiumFormats: z.array(z.string().min(1).max(120)).max(32).optional(),
});

export const locationSchema = z.object({
  id: uuidSchema,
  skyarcSiteCode: z.string().nullable().optional(),
  vendorMediaCode: z.string().nullable().optional(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: z.number().nullable(),
  capturedAt: z.string().datetime().nullable(),
  address: z.string().nullable(),
  road: z.string().nullable(),
  roadType: z.string().nullable(),
  junction: z.string().nullable(),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  orientationDeg: z.number().nullable(),
  mountingType: z.string().nullable(),
  mountingNotes: z.string().nullable(),
  surveyStatus: z.nativeEnum(SurveyStatus),
  archivedAt: z.string().datetime().nullable(),
  createdByUserId: uuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createLocationBodySchema = z.object({
  id: uuidSchema.optional(),
  skyarcSiteCode: z.string().optional(),
  vendorMediaCode: z.string().optional(),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().optional(),
  capturedAt: z.string().datetime().optional(),
  address: z.string().optional(),
  road: z.string().optional(),
  roadType: z.string().optional(),
  junction: z.string().optional(),
  city: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  orientationDeg: z.number().optional(),
  mountingType: z.string().optional(),
  mountingNotes: z.string().optional(),
  organizationId: uuidSchema.optional(),
});

export const updateLocationBodySchema = createLocationBodySchema
  .omit({ id: true })
  .partial()
  .extend({
    surveyStatus: z.nativeEnum(SurveyStatus).optional(),
  });

export const createAdvertiserBodySchema = z.object({
  name: z.string().min(1),
  categoryId: uuidSchema.optional(),
});

export const createCampaignBodySchema = z.object({
  name: z.string().min(1),
  advertiserId: uuidSchema.optional(),
  advertiserName: z.string().min(1).optional(),
  briefText: z.string().optional(),
  structuredRequirements: z.record(z.unknown()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateCampaignBodySchema = createCampaignBodySchema.partial();

export const updateCampaignBriefBodySchema = z.object({
  sourceText: z.string().optional(),
  structuredRequirements: z.record(z.unknown()).optional(),
});

export const optimizeMediaPlanBodySchema = z.object({
  name: z.string().default("Optimized Plan"),
  totalBudget: z.number().positive(),
  maxLocations: z.number().int().positive().optional(),
});

export const buildMediaPlanFromSelectionBodySchema = z
  .object({
    name: z.string().default("Selected Sites"),
    totalBudget: z.number().positive(),
    inventoryIds: z.array(uuidSchema).max(50).optional(),
    locationIds: z.array(uuidSchema).max(50).optional(),
    holdInventory: z.boolean().optional().default(true),
    /** DRAFT = vendor network request awaiting admin/planner approval */
    status: z.enum(["DRAFT", "PROPOSED"]).optional().default("PROPOSED"),
  })
  .refine(
    (body) =>
      Boolean(body.inventoryIds?.length) || Boolean(body.locationIds?.length),
    { message: "Select at least one site", path: ["locationIds"] }
  );

export const updateMediaPlanStatusBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PROPOSED", "DRAFT"]),
});

/** Vendor responds to their owned sites within a site request. */
export const respondSiteRequestBodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  /** When omitted, applies to all items owned by the vendor's organization. */
  inventoryIds: z.array(uuidSchema).max(50).optional(),
});

export const swapMediaPlanItemBodySchema = z.object({
  inventoryId: uuidSchema,
});

export const addMediaPlanItemBodySchema = z.object({
  inventoryId: uuidSchema,
});

export const bulkLocationActionBodySchema = z.object({
  locationIds: z.array(uuidSchema).min(1).max(100),
  action: z.enum(["ARCHIVE", "UNARCHIVE", "AVAILABLE", "UNAVAILABLE"]),
});

export const locationAvailabilityPreviewBodySchema = z.object({
  locationIds: z.array(uuidSchema).min(1).max(100),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const locationAvailabilityReleaseBodySchema =
  locationAvailabilityPreviewBodySchema.extend({
    reason: z.string().trim().min(8).max(2000),
  });

export const flightAvailabilityQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().min(1).max(50000).default(1000),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const fieldChecklistSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.string(), z.number()])
);

export const surveySchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  checklist: fieldChecklistSchema,
  voiceNoteAssetId: uuidSchema.nullable(),
  freeTextObservation: z.string().nullable(),
  syncState: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const upsertSurveyBodySchema = z.object({
  checklist: fieldChecklistSchema.default({}),
  voiceNoteAssetId: uuidSchema.nullable().optional(),
  freeTextObservation: z.string().nullable().optional(),
});

export const assetSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  kind: z.nativeEnum(AssetKind),
  view: z.nativeEnum(PhotoView),
  r2Key: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nullable(),
  checksumSha256: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  capturedAt: z.string().datetime().nullable(),
  capturedLat: z.number().nullable(),
  capturedLng: z.number().nullable(),
  uploadStatus: z.nativeEnum(UploadStatus),
  confirmedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const presignAssetBodySchema = z.object({
  assetId: uuidSchema,
  kind: z.nativeEnum(AssetKind),
  view: z.nativeEnum(PhotoView).optional(),
  /** Required when kind is CAMPAIGN_LIVE_PROOF. */
  campaignId: uuidSchema.optional(),
  contentType: z.string(),
  byteSize: z.number().int().positive(),
  checksumSha256: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  capturedAt: z.string().datetime().optional(),
  capturedLat: z.number().optional(),
  capturedLng: z.number().optional(),
});

export const presignResponseSchema = z.object({
  assetId: uuidSchema,
  uploadUrl: z.string().url(),
  r2Key: z.string(),
  expiresAt: z.string().datetime(),
});

export const confirmAssetBodySchema = z.object({
  checksumSha256: z.string().optional(),
  byteSize: z.number().int().positive().optional(),
});

export const uploadAssetQuerySchema = z.object({
  view: z.nativeEnum(PhotoView),
});

export const screenSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  label: z.string(),
  inventoryStatus: z.nativeEnum(InventoryStatus),
  operatingHoursJson: z.record(z.unknown()).nullable(),
  loopDurationSec: z.number().int().nullable(),
  slotDurationSec: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const screenSpecificationSchema = z.object({
  id: uuidSchema,
  screenId: uuidSchema,
  widthMm: z.number().nullable(),
  heightMm: z.number().nullable(),
  resolutionW: z.number().int().nullable(),
  resolutionH: z.number().int().nullable(),
  aspectRatio: z.string().nullable(),
  orientation: z.string().nullable(),
  mountingHeightM: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createScreenBodySchema = z.object({
  label: z.string().min(1),
  skyarcScreenCode: z
    .string()
    .regex(/^SKY-[A-Z0-9]+(?:-F\d+)?$/i)
    .optional(),
  inventoryStatus: z.nativeEnum(InventoryStatus).default(InventoryStatus.UNKNOWN),
  operatingHoursJson: z.record(z.unknown()).optional(),
  loopDurationSec: z.number().int().optional(),
  slotDurationSec: z.number().int().optional(),
});

export const updateScreenBodySchema = createScreenBodySchema.partial();

export const upsertScreenSpecBodySchema = z.object({
  widthMm: z.number().optional(),
  heightMm: z.number().optional(),
  resolutionW: z.number().int().optional(),
  resolutionH: z.number().int().optional(),
  aspectRatio: z.string().optional(),
  orientation: z.string().optional(),
  mountingHeightM: z.number().optional(),
});

export const createInventoryBodySchema = z.object({
  productCode: z.string().min(1).max(64),
  inventoryType: z.string().min(1).max(64).default(InventoryType.DIGITAL),
  notes: z.string().max(500).optional(),
  status: z.nativeEnum(InventoryStatus).default(InventoryStatus.AVAILABLE),
  /** Concurrent digital loop capacity. Omit or 1 = product default (6) for digital. */
  slotCapacity: z.number().int().min(1).max(48).optional(),
  staticSpecsJson: z.record(z.unknown()).optional(),
});

export const updateInventoryBodySchema = createInventoryBodySchema.partial();

export const createRateCardBodySchema = z.object({
  currency: z.string().min(3).max(3).default("INR"),
  period: z.string().min(1).max(32),
  amount: z.number().positive(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

export const locationAttributeSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  key: z.string(),
  valueJson: z.unknown(),
  unit: z.string().nullable(),
  provenance: z.nativeEnum(Provenance),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.string().nullable(),
  model: z.string().nullable(),
  evidenceJson: z.unknown().nullable(),
  observedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const scoreComponentSchema = z.object({
  factor: z.string(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  status: z.nativeEnum(ScoreStatus),
  evidence: z.array(z.string()).default([]),
});

export const locationScoreSchema = z.object({
  id: uuidSchema,
  locationId: uuidSchema,
  scoringConfigId: uuidSchema,
  overallScore: z.number().min(0).max(100),
  overallConfidence: z.number().min(0).max(1),
  status: z.nativeEnum(ScoreStatus),
  components: z.array(scoreComponentSchema),
  computedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const scoringMethodologyFactorSchema = z.object({
  basis: z.string().min(1).max(500),
  dataSources: z.array(z.string().min(1).max(200)).max(12).default([]),
});

export const scoringMethodologySchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  versionLabel: z.string().min(1).max(40),
  trustNotes: z.array(z.string().min(1).max(300)).max(12).default([]),
  factors: z.record(scoringMethodologyFactorSchema).optional(),
});

export const updateScoringConfigBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  weights: z
    .record(z.nativeEnum(ScoringFactor), z.number().min(0).max(100))
    .optional(),
  methodology: scoringMethodologySchema.optional(),
});

export const locationScoreFactorInputSchema = z.object({
  factor: z.nativeEnum(ScoringFactor),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1).optional().default(0.8),
  evidence: z.array(z.string().min(1).max(400)).max(8).default([]),
  /** Predefined reason ids from SCORING_REASON_PRESETS. */
  reasonIds: z.array(z.string().min(1).max(80)).max(12).optional().default([]),
  source: z.string().max(120).optional(),
});

export const updateLocationScoreInputsBodySchema = z.object({
  factors: z.array(locationScoreFactorInputSchema).min(1).max(16),
  /** Site-specific scenario — required for trustworthy customer-facing Index. */
  scenario: z
    .object({
      scenarioTitle: z.string().max(160).optional().default(""),
      scenarioSummary: z.string().max(2000).optional().default(""),
      trustNotes: z.array(z.string().min(1).max(300)).max(12).optional().default([]),
    })
    .optional(),
});

export const aiAnalysisSchema = z.object({
  id: uuidSchema,
  operation: z.nativeEnum(AIOperation),
  status: z.nativeEnum(AIAnalysisStatus),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputHash: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  errorCode: z.string().nullable(),
  outputJson: z.unknown().nullable(),
  locationId: uuidSchema.nullable(),
  campaignId: uuidSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createAnalysisBodySchema = z.object({
  operation: z.nativeEnum(AIOperation).default(AIOperation.LOCATION_IMAGE_ANALYSIS),
});

export const importInventoryItemSchema = z.object({
  name: z.string().min(1),
  skyarcSiteCode: z.string().nullish().transform((v) => v ?? undefined),
  vendorMediaCode: z.string().nullish().transform((v) => v ?? undefined),
  /** @deprecated use vendorMediaCode */
  iid: z.string().nullish().transform((v) => v ?? undefined),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().nullish().transform((v) => v ?? undefined),
  district: z.string().nullish().transform((v) => v ?? undefined),
  state: z.string().nullish().transform((v) => v ?? undefined),
  area: z.string().nullish().transform((v) => v ?? undefined),
  locationDescription: z.string().nullish().transform((v) => v ?? undefined),
  mediaType: z.string().nullish().transform((v) => v ?? "STATIC_BILLBOARD"),
  widthFt: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  heightFt: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  sqft: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  lightingType: z.string().nullish().transform((v) => v ?? undefined),
  availableFrom: z.string().nullish().transform((v) => v ?? undefined),
  cardRateAmount: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  discountedRateAmount: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  ratePeriod: z.string().nullish().transform((v) => v ?? "monthly"),
  premium: z.boolean().optional(),
});

export const importInventoryBatchBodySchema = z.object({
  vendorOrgName: z.string().nullish().transform((v) => v ?? undefined),
  vendorAdminEmail: z.string().email().nullish().or(z.literal("")).transform((v) => (v ? v : undefined)),
  createVendorIfMissing: z.boolean().optional().default(false),
  items: z.array(importInventoryItemSchema).min(1).max(500),
});

export type ImportInventoryItem = z.infer<typeof importInventoryItemSchema>;
export type ImportInventoryBatchBody = z.infer<typeof importInventoryBatchBodySchema>;

export const bookingQuoteBodySchema = z.object({
  inventoryId: uuidSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  playsPerDay: z.number().int().min(1).max(100_000),
  creativeDurationSec: z.number().int().min(1).max(300).default(10),
  distributionMode: z
    .enum(["AUTOMATIC", "ALL_DAY", "MORNING", "AFTERNOON", "EVENING", "CUSTOM"])
    .default("AUTOMATIC"),
  customTimeStartMinute: z.number().int().min(0).max(24 * 60).optional(),
  customTimeEndMinute: z.number().int().min(0).max(24 * 60).optional(),
  loopDurationSec: z.number().int().min(1).max(3600).optional(),
  baseRateAmount: z.number().min(0).optional(),
  ratePeriod: z.string().max(32).optional(),
  gstPercent: z.number().min(0).max(40).optional(),
});

export type BookingQuoteBody = z.infer<typeof bookingQuoteBodySchema>;

export const bookingReserveBodySchema = z.object({
  campaignId: uuidSchema,
  inventoryIds: z.array(uuidSchema).min(1).max(100),
  mediaPlanId: uuidSchema.optional(),
  mode: z.enum(["hold", "book"]).default("hold"),
  requireVendorApproval: z.boolean().optional().default(false),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type BookingReserveBody = z.infer<typeof bookingReserveBodySchema>;

export const bookingVendorRespondBodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  inventoryIds: z.array(uuidSchema).max(100).optional(),
  vendorOrganizationId: uuidSchema.optional(),
});

export type BookingVendorRespondBody = z.infer<typeof bookingVendorRespondBodySchema>;

export const issueQuoteBodySchema = z.object({
  campaignId: uuidSchema,
  mediaPlanId: uuidSchema.optional(),
  lines: z
    .array(
      z.object({
        inventoryId: uuidSchema,
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        playsPerDay: z.number().int().min(1).max(100_000),
        creativeDurationSec: z.number().int().min(1).max(300).default(10),
        distributionMode: z
          .enum(["AUTOMATIC", "ALL_DAY", "MORNING", "AFTERNOON", "EVENING", "CUSTOM"])
          .default("ALL_DAY"),
        customTimeStartMinute: z.number().int().min(0).max(24 * 60).optional(),
        customTimeEndMinute: z.number().int().min(0).max(24 * 60).optional(),
        loopDurationSec: z.number().int().min(1).max(3600).optional(),
      })
    )
    .min(1)
    .max(50),
  expiresAt: z.string().datetime().optional(),
});

export type IssueQuoteBody = z.infer<typeof issueQuoteBodySchema>;

export const acceptQuoteBodySchema = z.object({
  mode: z.enum(["hold", "book"]).default("book"),
  requireVendorApproval: z.boolean().optional().default(false),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type AcceptQuoteBody = z.infer<typeof acceptQuoteBodySchema>;

export const healthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type CreateLocationBody = z.infer<typeof createLocationBodySchema>;
export type PresignAssetBody = z.infer<typeof presignAssetBodySchema>;


export const createDeviceBodySchema = z.object({
  provider: z.enum(["orbit", "xtreme", "led_controller", "other"]).default("orbit"),
  deviceType: z
    .enum(["orbit_edge", "orbit_edge_sense", "media_player", "led_controller", "other"])
    .default("orbit_edge"),
  externalId: z.string().min(1).max(128).optional(),
});

export const orbitEventEnvelopeSchema = z.object({
  eventId: uuidSchema,
  eventType: z.string().min(1),
  version: z.number().int().min(1).default(1),
  tenantId: z.string().min(1),
  timestamp: z.string().datetime(),
  source: z.literal("orbit-cloud"),
  correlationId: uuidSchema.optional(),
  payload: z.record(z.unknown()),
});
