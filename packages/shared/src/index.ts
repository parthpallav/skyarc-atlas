export const UserRole = {
  ADMIN: "ADMIN",
  MEDIA_PLANNER: "MEDIA_PLANNER",
  SALES: "SALES",
  FIELD_OPERATOR: "FIELD_OPERATOR",
  VIEWER: "VIEWER",
  VENDOR_ADMIN: "VENDOR_ADMIN",
  VENDOR_OPS: "VENDOR_OPS",
  CLIENT_VIEWER: "CLIENT_VIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrganizationType = {
  INTERNAL: "INTERNAL",
  VENDOR: "VENDOR",
  CLIENT: "CLIENT",
} as const;
export type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

export const OrganizationStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BLACKLISTED: "BLACKLISTED",
} as const;
export type OrganizationStatus =
  (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const Provenance = {
  USER_PROVIDED: "USER_PROVIDED",
  OBSERVED: "OBSERVED",
  DERIVED: "DERIVED",
  ESTIMATED: "ESTIMATED",
  AI_INFERRED: "AI_INFERRED",
  UNKNOWN: "UNKNOWN",
} as const;
export type Provenance = (typeof Provenance)[keyof typeof Provenance];

export const AssetKind = {
  PHOTO: "PHOTO",
  APPROACH_VIDEO: "APPROACH_VIDEO",
  REVERSE_PHOTO: "REVERSE_PHOTO",
  VOICE_NOTE: "VOICE_NOTE",
  OTHER: "OTHER",
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const UploadStatus = {
  PENDING: "PENDING",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",
  FAILED: "FAILED",
  RETRYING: "RETRYING",
} as const;
export type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus];

export const SurveyStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  SUBMITTED: "SUBMITTED",
} as const;
export type SurveyStatus = (typeof SurveyStatus)[keyof typeof SurveyStatus];

export const InventoryStatus = {
  AVAILABLE: "AVAILABLE",
  RESERVED: "RESERVED",
  UNAVAILABLE: "UNAVAILABLE",
  UNKNOWN: "UNKNOWN",
} as const;
export type InventoryStatus = (typeof InventoryStatus)[keyof typeof InventoryStatus];

export const ScoreStatus = {
  INCOMPLETE: "INCOMPLETE",
  COMPUTED: "COMPUTED",
  STALE: "STALE",
} as const;
export type ScoreStatus = (typeof ScoreStatus)[keyof typeof ScoreStatus];

export const AIAnalysisStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type AIAnalysisStatus = (typeof AIAnalysisStatus)[keyof typeof AIAnalysisStatus];

export const AIOperation = {
  LOCATION_IMAGE_ANALYSIS: "LOCATION_IMAGE_ANALYSIS",
  LOCATION_SUMMARIZATION: "LOCATION_SUMMARIZATION",
  CAMPAIGN_BRIEF_PARSE: "CAMPAIGN_BRIEF_PARSE",
  ADVERTISER_CLASSIFY: "ADVERTISER_CLASSIFY",
  MEDIA_PLAN_EXPLAIN: "MEDIA_PLAN_EXPLAIN",
} as const;
export type AIOperation = (typeof AIOperation)[keyof typeof AIOperation];

export const SyncState = {
  PENDING: "PENDING",
  UPLOADING: "UPLOADING",
  UPLOADED: "UPLOADED",
  FAILED: "FAILED",
  RETRYING: "RETRYING",
} as const;
export type SyncState = (typeof SyncState)[keyof typeof SyncState];

export const ScoringFactor = {
  VISIBILITY: "VISIBILITY",
  AUDIENCE_FIT: "AUDIENCE_FIT",
  COMMERCIAL_FIT: "COMMERCIAL_FIT",
  APPROACH_EXPOSURE: "APPROACH_EXPOSURE",
  BRAND_SUITABILITY: "BRAND_SUITABILITY",
  VISUAL_COMPETITION: "VISUAL_COMPETITION",
  LOCATION_QUALITY: "LOCATION_QUALITY",
  DATA_CONFIDENCE: "DATA_CONFIDENCE",
} as const;
export type ScoringFactor = (typeof ScoringFactor)[keyof typeof ScoringFactor];

export const API_PREFIX = "/api/v1";

/** Standard field-survey photo angles (display order). */
export const PhotoView = {
  FRONT: "FRONT",
  APPROACH: "APPROACH",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  REVERSE: "REVERSE",
  SURROUNDING: "SURROUNDING",
  OTHER: "OTHER",
} as const;
export type PhotoView = (typeof PhotoView)[keyof typeof PhotoView];

export const PHOTO_VIEW_ORDER: Record<PhotoView, number> = {
  FRONT: 1,
  APPROACH: 2,
  LEFT: 3,
  RIGHT: 4,
  REVERSE: 5,
  SURROUNDING: 6,
  OTHER: 99,
};

export const PHOTO_VIEW_LABELS: Record<PhotoView, string> = {
  FRONT: "Front",
  APPROACH: "Approach",
  LEFT: "Left",
  RIGHT: "Right",
  REVERSE: "Back",
  SURROUNDING: "Surrounding",
  OTHER: "Other",
};

export const SURVEY_PHOTO_VIEWS: PhotoView[] = [
  PhotoView.FRONT,
  PhotoView.APPROACH,
  PhotoView.LEFT,
  PhotoView.RIGHT,
  PhotoView.REVERSE,
  PhotoView.SURROUNDING,
];

/** Human-readable R2 folder slug from location name (e.g. "H-0165 — Kalawad Road"). */
export function slugifyLocationFolder(name: string, fallbackId?: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  if (slug) return slug;
  return fallbackId ? `location-${fallbackId.slice(0, 8)}` : "location-unknown";
}

export function extensionFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("heic")) return "heic";
  if (ct.includes("heif")) return "heif";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("mp4") || ct.includes("m4v")) return "mp4";
  if (ct.includes("m4a") || ct.includes("mp4a")) return "m4a";
  return "bin";
}

export const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
] as const;

export const MEDIA_SIZE_LIMITS = {
  maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
  maxVoiceBytes: 10 * 1024 * 1024,
} as const;

export function isImageContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/");
}

export function isVideoContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("video/");
}

export function isLocationMediaContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    isImageContentType(ct) ||
    (VIDEO_CONTENT_TYPES as readonly string[]).some((allowed) => allowed === ct)
  );
}

export function maxBytesForContentType(contentType: string): number {
  if (isVideoContentType(contentType)) return MEDIA_SIZE_LIMITS.maxVideoBytes;
  if (contentType.toLowerCase().startsWith("audio/")) {
    return MEDIA_SIZE_LIMITS.maxVoiceBytes;
  }
  return MEDIA_SIZE_LIMITS.maxImageBytes;
}

export function resolvePhotoView(kind: AssetKind, view?: PhotoView): PhotoView {
  if (view) return view;
  if (kind === AssetKind.REVERSE_PHOTO) return PhotoView.REVERSE;
  return PhotoView.OTHER;
}

export function photoViewSortKey(view: PhotoView | string | null | undefined): number {
  if (!view) return PHOTO_VIEW_ORDER.OTHER;
  return PHOTO_VIEW_ORDER[view as PhotoView] ?? PHOTO_VIEW_ORDER.OTHER;
}

export interface BuildAssetKeyInput {
  locationFolder: string;
  kind: AssetKind;
  view?: PhotoView;
  assetId: string;
  contentType?: string;
}

/**
 * R2 object key using human-readable location folder + view filename.
 * Example: locations/h-0165-kalawad-road/views/front.webp
 */
export function buildAssetKey(input: BuildAssetKeyInput): string {
  const { locationFolder, kind, assetId, contentType } = input;
  const view = resolvePhotoView(kind, input.view);
  const ext = extensionFromContentType(contentType ?? "image/webp");

  if (kind === AssetKind.APPROACH_VIDEO) {
    return `locations/${locationFolder}/videos/approach.${ext}`;
  }
  if (kind === AssetKind.VOICE_NOTE) {
    return `locations/${locationFolder}/audio/voice-note.${ext}`;
  }

  const viewFile =
    view === PhotoView.OTHER
      ? `other-${assetId.slice(0, 8)}`
      : view.toLowerCase();

  return `locations/${locationFolder}/views/${viewFile}.${ext}`;
}

/** SkyArc brand palette — from official logo assets (purple + black). */
export const SKYARC_BRAND = {
  purple: "#A855F7",
  purpleDark: "#9333EA",
  purpleLight: "#C084FC",
  purpleMuted: "#E9D5FF",
  black: "#000000",
  blackSoft: "#0A0A0A",
  surface: "#F5F3FF",
  card: "#FFFFFF",
  border: "#E9D5FF",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  onDark: "#FFFFFF",
  onDarkMuted: "#A1A1AA",
  tagline: "Find your spotlight.",
} as const;

export const SKYARC_LOGO_WHITE_URL =
  "https://pub-854b1a1d4dc34a41b4777642ea2bb6c6.r2.dev/logos/skyarc_logo_white.png";

export { SAMPLE_CAMPAIGN, SAMPLE_CAMPAIGN_BRIEF } from "./campaign-brief.js";
export {
  SCORING_FACTOR_CLIENT,
  PLAN_HIGHLIGHT_FACTORS,
  scoreBand,
  type ClientFactorMeta,
} from "./scoring-display.js";
