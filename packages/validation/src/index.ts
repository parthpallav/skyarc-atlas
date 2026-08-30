import { z } from "zod";
import {
  AssetKind,
  InventoryStatus,
  InventoryType,
  OrganizationStatus,
  OrganizationType,
  Provenance,
  ScoreStatus,
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
  q: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
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

export const updateSkyarcLocationCommercialBodySchema = z.object({
  clientRateAmount: z.number().positive().optional(),
  ratePeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
  currency: z.string().min(3).max(3).optional(),
  notes: z.string().max(2000).optional(),
});

export const platformConfigBodySchema = z.object({
  defaultSkyarcMarginPercent: marginPercentSchema.optional(),
  currency: z.string().min(3).max(3).optional(),
});

export const locationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: z.number().nullable(),
  capturedAt: z.string().datetime().nullable(),
  address: z.string().nullable(),
  road: z.string().nullable(),
  roadType: z.string().nullable(),
  junction: z.string().nullable(),
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
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().optional(),
  capturedAt: z.string().datetime().optional(),
  address: z.string().optional(),
  road: z.string().optional(),
  roadType: z.string().optional(),
  junction: z.string().optional(),
  orientationDeg: z.number().optional(),
  mountingType: z.string().optional(),
  mountingNotes: z.string().optional(),
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
});

export const updateCampaignBriefBodySchema = z.object({
  sourceText: z.string().optional(),
  structuredRequirements: z.record(z.unknown()).optional(),
});

export const optimizeMediaPlanBodySchema = z.object({
  name: z.string().default("Optimized Plan"),
  totalBudget: z.number().positive(),
  maxLocations: z.number().int().positive().optional(),
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
  iid: z.string().nullish().transform((v) => v ?? undefined),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().nullish().transform((v) => v ?? undefined),
  district: z.string().nullish().transform((v) => v ?? undefined),
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
});

export const importInventoryBatchBodySchema = z.object({
  vendorOrgName: z.string().nullish().transform((v) => v ?? undefined),
  vendorAdminEmail: z.string().email().nullish().or(z.literal("")).transform((v) => (v ? v : undefined)),
  items: z.array(importInventoryItemSchema).min(1).max(500),
});

export type ImportInventoryItem = z.infer<typeof importInventoryItemSchema>;
export type ImportInventoryBatchBody = z.infer<typeof importInventoryBatchBodySchema>;

export const healthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type CreateLocationBody = z.infer<typeof createLocationBodySchema>;
export type PresignAssetBody = z.infer<typeof presignAssetBodySchema>;
