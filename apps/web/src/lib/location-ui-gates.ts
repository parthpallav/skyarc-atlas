export type DetailTabId =
  | "overview"
  | "availability"
  | "rates"
  | "faces"
  | "orbit"
  | "admin";

export type EditTabId =
  | "photos"
  | "site"
  | "faces"
  | "index"
  | "pricing"
  | "orbit"
  | "danger";

export const EDIT_TAB_ORDER: readonly EditTabId[] = [
  "photos",
  "site",
  "faces",
  "index",
  "pricing",
  "orbit",
  "danger",
] as const;

export interface LocationUiGateInput {
  isClient: boolean;
  isVendor: boolean;
  isInternal: boolean;
  isAdmin: boolean;
  isReadOnly: boolean;
  /** Location belongs to the current vendor org / is editable as owned. */
  isOwned: boolean;
  canEdit: boolean;
  /** Platform flag: show vendor commercial details to internal users. */
  showVendorDetails: boolean;
  /** From shared canViewClientPricing(authUser). */
  canViewClientPricing: boolean;
  /** NEXT_PUBLIC_ORBIT_UI === "true". */
  orbitUiEnabled: boolean;
  /** NEXT_PUBLIC_ADTECH_BOOKING === "true" — digital slot meters / Availability tab. */
  adtechBookingEnabled: boolean;
}

export interface LocationUiGates {
  canOpenEdit: boolean;
  showAvailabilityTab: boolean;
  showRatesTab: boolean;
  showFacesTab: boolean;
  showOrbitTab: boolean;
  showAdminTab: boolean;
  showVendorCommercial: boolean;
  showSkyarcPricing: boolean;
  canEditSkyarcPricing: boolean;
  canEditScoreInputs: boolean;
  showSkyarcIndexOnOverview: boolean;
  showEditPhotos: boolean;
  showEditSite: boolean;
  showEditFaces: boolean;
  showEditIndex: boolean;
  showEditPricing: boolean;
  showEditOrbit: boolean;
  showEditDanger: boolean;
  detailTabs: Array<{ id: DetailTabId; label: string }>;
  editTabs: Array<{ id: EditTabId; label: string }>;
}

const EDIT_LABELS: Record<EditTabId, string> = {
  photos: "Photos",
  site: "Site",
  faces: "Faces",
  index: "Index",
  pricing: "Pricing",
  orbit: "Orbit",
  danger: "Danger",
};

/**
 * Single source of truth for location detail/edit visibility.
 * Orbit UI is internal/admin only (never vendors) while MQTT APIs stay ready.
 */
export function resolveLocationUiGates(input: LocationUiGateInput): LocationUiGates {
  const {
    isClient,
    isVendor,
    isInternal,
    isAdmin,
    isReadOnly,
    isOwned,
    canEdit,
    showVendorDetails,
    canViewClientPricing,
    orbitUiEnabled,
    adtechBookingEnabled,
  } = input;

  const canOpenEdit = canEdit && !isClient && !isReadOnly && (isOwned || isInternal);

  // Vendor rates: never clients; never network vendors.
  // Owned vendors always see their own commercial (showcase mode must not hide Pricing).
  // Internal users respect platform showVendorDetails (client screen-share mode).
  const showVendorCommercial =
    !isClient &&
    isOwned &&
    (isVendor || (isInternal && showVendorDetails));

  const showSkyarcPricing = !isClient && canViewClientPricing;
  const canEditSkyarcPricing = showSkyarcPricing && !isReadOnly && canOpenEdit;

  const showFacesTab = (isOwned || isInternal) && !isClient;
  const showRatesTab = showVendorCommercial || showSkyarcPricing;
  // Orbit: never vendors or clients — internal/admin + feature flag only.
  const showOrbitTab = orbitUiEnabled && isInternal && !isVendor && !isClient;
  const showAdminTab = isAdmin;
  // Digital availability / slot meters are AdTech-only (classic UX stays media-plan focused).
  const showAvailabilityTab = adtechBookingEnabled;

  const canEditScoreInputs =
    isInternal && !isClient && !isReadOnly && (canEdit || isAdmin || isInternal);

  const showSkyarcIndexOnOverview = canEditScoreInputs || isInternal;

  const showEditPhotos = canOpenEdit;
  const showEditSite = canOpenEdit;
  const showEditFaces = canOpenEdit && showFacesTab;
  const showEditIndex = canOpenEdit && canEditScoreInputs;
  const showEditPricing =
    canOpenEdit && (showVendorCommercial || canEditSkyarcPricing || showSkyarcPricing);
  const showEditOrbit = canOpenEdit && showOrbitTab;
  const showEditDanger = canOpenEdit && (isAdmin || (isVendor && isOwned) || isInternal);

  const detailTabs: Array<{ id: DetailTabId; label: string }> = [
    { id: "overview", label: "Overview" },
  ];
  if (showAvailabilityTab) detailTabs.push({ id: "availability", label: "Availability" });
  if (showRatesTab) detailTabs.push({ id: "rates", label: "Rates" });
  if (showFacesTab) detailTabs.push({ id: "faces", label: "Faces" });
  if (showOrbitTab) detailTabs.push({ id: "orbit", label: "Orbit" });
  if (showAdminTab) detailTabs.push({ id: "admin", label: "Admin" });

  const editVisibility: Record<EditTabId, boolean> = {
    photos: showEditPhotos,
    site: showEditSite,
    faces: showEditFaces,
    index: showEditIndex,
    pricing: showEditPricing,
    orbit: showEditOrbit,
    danger: showEditDanger,
  };

  const editTabs = EDIT_TAB_ORDER.filter((id) => editVisibility[id]).map((id) => ({
    id,
    label: EDIT_LABELS[id],
  }));

  return {
    canOpenEdit,
    showAvailabilityTab,
    showRatesTab,
    showFacesTab,
    showOrbitTab,
    showAdminTab,
    showVendorCommercial,
    showSkyarcPricing,
    canEditSkyarcPricing,
    canEditScoreInputs,
    showSkyarcIndexOnOverview,
    showEditPhotos,
    showEditSite,
    showEditFaces,
    showEditIndex,
    showEditPricing,
    showEditOrbit,
    showEditDanger,
    detailTabs,
    editTabs,
  };
}

/** Resolve ?tab= against allowed edit tabs; fallback to first allowed (Photos when present). */
export function resolveEditTab(
  requested: string | null | undefined,
  gates: LocationUiGates
): EditTabId {
  const allowed = gates.editTabs.map((t) => t.id);
  if (allowed.length === 0) return "photos";
  if (requested && allowed.includes(requested as EditTabId)) {
    return requested as EditTabId;
  }
  return allowed[0] ?? "photos";
}
