import { API_PREFIX } from "@skyarc/shared";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  getRefreshToken?: () => string | null | Promise<string | null>;
  onTokenRefreshed?: (tokens: { accessToken: string; refreshToken: string }) => void | Promise<void>;
  onUnauthorized?: () => void | Promise<void>;
}

export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Array<{ path?: string; message: string }>;
  };
}

export class ApiClient {
  private refreshPromise: Promise<string | null> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  private async attemptRefresh(): Promise<string | null> {
    if (!this.options.getRefreshToken) return null;
    const refreshToken = await this.options.getRefreshToken();
    if (!refreshToken) return null;

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const res = await fetch(`${this.options.baseUrl}${API_PREFIX}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
          if (!res.ok) {
            await this.options.onUnauthorized?.();
            return null;
          }
          const body = (await res.json()) as ApiResponse<{
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
          }>;
          if (body?.data?.accessToken) {
            await this.options.onTokenRefreshed?.({
              accessToken: body.data.accessToken,
              refreshToken: body.data.refreshToken,
            });
            return body.data.accessToken;
          }
          return null;
        } catch {
          await this.options.onUnauthorized?.();
          return null;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.options.getAccessToken
      ? await this.options.getAccessToken()
      : null;

    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };
    if (init.body != null && init.body !== "" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    let response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
      ...init,
      headers,
    });

    if (
      response.status === 401 &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/forgot-password") &&
      !path.startsWith("/auth/reset-password")
    ) {
      const newToken = await this.attemptRefresh();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
          ...init,
          headers,
        });
      }
    }

    const body = (await response.json()) as ApiResponse<T> | ApiErrorBody;
    if (!response.ok) {
      const err = body as ApiErrorBody;
      throw new Error(err.error?.message ?? "API request failed");
    }
    return body as ApiResponse<T>;
  }

  private async requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
    const token = this.options.getAccessToken
      ? await this.options.getAccessToken()
      : null;

    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    let response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
      ...init,
      headers,
    });

    if (
      response.status === 401 &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/refresh") &&
      !path.startsWith("/auth/forgot-password") &&
      !path.startsWith("/auth/reset-password")
    ) {
      const newToken = await this.attemptRefresh();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
          ...init,
          headers,
        });
      }
    }

    if (!response.ok) {
      let message = "API request failed";
      try {
        const body = (await response.json()) as ApiErrorBody;
        message = body.error?.message ?? message;
      } catch {
        // ignore non-JSON error bodies
      }
      throw new Error(message);
    }

    return response.blob();
  }

  login(email: string, password: string, deviceLabel?: string) {
    return this.request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: {
        id: string;
        email: string;
        name: string;
        role: string;
        organizationId: string | null;
      };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceLabel }),
    });
  }

  refresh(refreshToken: string) {
    return this.request<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      "/auth/refresh",
      { method: "POST", body: JSON.stringify({ refreshToken }) }
    );
  }

  logout(refreshToken: string) {
    return this.request<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  listLocations(
    page = 1,
    limit = 20,
    scope?: "mine" | "discovery" | "all",
    filters?: {
      q?: string;
      status?: string;
      type?: string;
      from?: string;
      to?: string;
      cities?: string[];
      districts?: string[];
      states?: string[];
      corridors?: string[];
      visibility?: "active" | "hidden" | "all";
    }
  ) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (scope) params.set("scope", scope);
    if (filters?.q) params.set("q", filters.q);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.from) params.set("from", filters.from);
    if (filters?.to) params.set("to", filters.to);
    if (filters?.cities?.length) params.set("cities", filters.cities.join(","));
    if (filters?.districts?.length) params.set("districts", filters.districts.join(","));
    if (filters?.states?.length) params.set("states", filters.states.join(","));
    if (filters?.corridors?.length) params.set("corridors", filters.corridors.join(","));
    if (filters?.visibility && filters.visibility !== "active") {
      params.set("visibility", filters.visibility);
    }
    return this.request<unknown[]>(`/locations?${params.toString()}`);
  }

  getLocationGeoFacets() {
    return this.request<{
      cities: string[];
      districts: string[];
      states: string[];
      corridors: string[];
      markets: Array<{
        id: string;
        name: string;
        district: string;
        state: string;
        stateCode: string;
        siteCodePrefix: string;
        center: { lat: number; lng: number };
        defaultZoom: number;
        corridors: string[];
      }>;
    }>("/locations/geo-facets");
  }

  listLocationAvailability(from: string, to: string) {
    const params = new URLSearchParams({ from, to });
    return this.request<{
      from: string;
      to: string;
      durationDays: number;
      availableSites: number;
      availableFaces: number;
      bookedFaces: number;
      sites: unknown[];
    }>(`/locations/availability?${params.toString()}`);
  }

  createLocation(data: Record<string, unknown>) {
    return this.request<unknown>("/locations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getLocation(id: string, flight?: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (flight?.from) params.set("from", flight.from);
    if (flight?.to) params.set("to", flight.to);
    const qs = params.toString();
    return this.request<unknown>(`/locations/${id}${qs ? `?${qs}` : ""}`);
  }

  /** Heartbeat: this user is exploring a site right now. */
  touchLocationPresence(id: string, surface?: "list" | "detail" | "map") {
    return this.request<{ ok: boolean; expiresIn: number }>(`/locations/${id}/presence`, {
      method: "POST",
      body: JSON.stringify({ surface }),
    });
  }

  /** Batch: live explorers + draft/proposed plan counts for conversion signals. */
  getSiteInterest(locationIds: string[]) {
    return this.request<{
      byLocationId: Record<
        string,
        { viewersNow: number; inActivePlans: number }
      >;
      computedAt: string;
    }>("/locations/site-interest", {
      method: "POST",
      body: JSON.stringify({ locationIds }),
    });
  }

  updateLocation(id: string, data: Record<string, unknown>) {
    return this.request<unknown>(`/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  deleteLocation(id: string) {
    return this.request<{ deleted: boolean; id: string }>(`/locations/${id}`, {
      method: "DELETE",
    });
  }

  listAdvertisers() {
    return this.request<unknown[]>("/advertisers");
  }

  createAdvertiser(name: string) {
    return this.request<unknown>("/advertisers", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  listCampaigns(page = 1, limit = 20, q?: string) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (q) params.set("q", q);
    return this.request<unknown[]>(`/campaigns?${params.toString()}`);
  }

  getCampaign(id: string) {
    return this.request<unknown>(`/campaigns/${id}`);
  }

  markCampaignReadyForSiteRequests(id: string) {
    return this.request<{
      id: string;
      readyForSiteRequestsAt: string | null;
      readyForSiteRequests: boolean;
    }>(`/campaigns/${id}/ready-for-site-requests`, { method: "POST" });
  }

  createCampaign(data: Record<string, unknown>) {
    return this.request<unknown>("/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  updateCampaign(id: string, data: Record<string, unknown>) {
    return this.request<unknown>(`/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  deleteCampaign(id: string) {
    return this.request<{ deleted: boolean; id: string }>(`/campaigns/${id}`, {
      method: "DELETE",
    });
  }

  updateCampaignBrief(
    campaignId: string,
    data: { sourceText?: string; structuredRequirements?: Record<string, unknown> } | string
  ) {
    const body = typeof data === "string" ? { sourceText: data } : data;
    return this.request<unknown>(`/campaigns/${campaignId}/brief`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  parseCampaignBrief(campaignId: string) {
    return this.request<unknown>(`/campaigns/${campaignId}/brief/parse`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  getMediaPlanPlanningPreview(campaignId: string) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/planning-preview`);
  }

  optimizeMediaPlan(
    campaignId: string,
    data: { name?: string; totalBudget: number; maxLocations?: number }
  ) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/optimize`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  listMediaPlans(page = 1, limit = 50, q?: string) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (q) params.set("q", q);
    return this.request<unknown[]>(`/media-plans?${params.toString()}`);
  }

  buildMediaPlanFromSelection(
    campaignId: string,
    data: {
      name?: string;
      totalBudget: number;
      inventoryIds?: string[];
      locationIds?: string[];
      holdInventory?: boolean;
      status?: "DRAFT" | "PROPOSED";
    }
  ) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/from-selection`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Play-based AdTech quote (feasibility + price breakdown). Read-only. */
  bookingQuote(data: {
    inventoryId: string;
    startDate: string;
    endDate: string;
    playsPerDay: number;
    creativeDurationSec?: number;
    distributionMode?:
      | "AUTOMATIC"
      | "ALL_DAY"
      | "MORNING"
      | "AFTERNOON"
      | "EVENING"
      | "CUSTOM";
    customTimeStartMinute?: number;
    customTimeEndMinute?: number;
    loopDurationSec?: number;
    baseRateAmount?: number;
    ratePeriod?: string;
    gstPercent?: number;
  }) {
    return this.request<unknown>("/booking/quote", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  updateMediaPlanStatus(
    campaignId: string,
    planId: string,
    status: "APPROVED" | "REJECTED" | "PROPOSED" | "DRAFT"
  ) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/${planId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  respondSiteRequest(
    campaignId: string,
    planId: string,
    data: { action: "APPROVE" | "REJECT"; inventoryIds?: string[] }
  ) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/${planId}/respond`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  swapMediaPlanItem(
    campaignId: string,
    planId: string,
    itemId: string,
    inventoryId: string
  ) {
    return this.request<unknown>(
      `/campaigns/${campaignId}/media-plans/${planId}/items/${itemId}/swap`,
      {
        method: "POST",
        body: JSON.stringify({ inventoryId }),
      }
    );
  }

  addMediaPlanItem(campaignId: string, planId: string, inventoryId: string) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/${planId}/items`, {
      method: "POST",
      body: JSON.stringify({ inventoryId }),
    });
  }

  getMediaPlan(campaignId: string, planId: string) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/${planId}`);
  }

  deleteMediaPlan(campaignId: string, planId: string) {
    return this.request<{ deleted: boolean; id: string }>(
      `/campaigns/${campaignId}/media-plans/${planId}`,
      { method: "DELETE" }
    );
  }

  exportMediaPlanPdf(campaignId: string, planId: string) {
    return this.requestBlob(
      `/campaigns/${campaignId}/media-plans/${planId}/export/pdf`,
      { method: "POST" }
    );
  }

  nearbyLocations(lat: number, lng: number, radiusM = 1000) {
    return this.request<unknown[]>(
      `/locations/nearby?lat=${lat}&lng=${lng}&radiusM=${radiusM}`
    );
  }

  upsertSurvey(locationId: string, data: Record<string, unknown>) {
    return this.request<unknown>(`/locations/${locationId}/survey`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  presignAsset(locationId: string, data: Record<string, unknown>) {
    return this.request<{
      assetId: string;
      uploadUrl: string;
      r2Key: string;
      expiresAt: string;
    }>(`/locations/${locationId}/assets/presign`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  confirmAsset(locationId: string, assetId: string, data?: Record<string, unknown>) {
    return this.request<unknown>(`/locations/${locationId}/assets/${assetId}/confirm`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  }

  listAssets(locationId: string) {
    return this.request<unknown[]>(`/locations/${locationId}/assets`);
  }

  deleteLocationAsset(locationId: string, assetId: string) {
    return this.request<{ id: string; view: string; removed: boolean }>(
      `/locations/${locationId}/assets/${assetId}`,
      { method: "DELETE" }
    );
  }

  async uploadLocationPhoto(
    locationId: string,
    view: string,
    file: Blob,
    contentType: string
  ): Promise<ApiResponse<unknown>> {
    const token = this.options.getAccessToken
      ? await this.options.getAccessToken()
      : null;

    const headers: Record<string, string> = {
      "Content-Type": contentType,
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `${this.options.baseUrl}${API_PREFIX}/locations/${locationId}/assets/upload?view=${encodeURIComponent(view)}`,
      {
        method: "POST",
        headers,
        body: file,
      }
    );

    const json = (await response.json()) as ApiResponse<unknown> | ApiErrorBody;
    if (!response.ok) {
      const err = json as ApiErrorBody;
      throw new Error(err.error?.message ?? `Upload failed (${response.status})`);
    }
    return json as ApiResponse<unknown>;
  }

  getLocationScore(locationId: string) {
    return this.request<{
      id: string;
      locationId: string;
      scoringConfigId: string;
      overallScore: number;
      overallConfidence: number;
      status: string;
      components: unknown;
      methodology?: unknown;
      configName?: string;
      configUpdatedAt?: string;
      computedAt: string;
    } | null>(`/locations/${locationId}/score`);
  }

  getScoringConfig() {
    return this.request<{
      id: string;
      name: string;
      isActive: boolean;
      weights: Record<string, number>;
      methodology: unknown;
      updatedAt: string;
      canEdit: boolean;
    }>("/scoring-config");
  }

  updateScoringConfig(data: {
    name?: string;
    weights?: Record<string, number>;
    methodology?: unknown;
  }) {
    return this.request<unknown>("/scoring-config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getLocationScoreInputs(locationId: string) {
    return this.request<{
      locationId: string;
      scenario?: {
        scenarioTitle: string;
        scenarioSummary: string;
        trustNotes: string[];
      };
      factors: Array<{
        factor: string;
        attributeKey: string;
        score: number | null;
        confidence: number | null;
        evidence: string[];
        reasonIds?: string[];
        provenance: string | null;
        source: string | null;
        updatedAt: string | null;
      }>;
    }>(`/locations/${locationId}/score-inputs`);
  }

  updateLocationScoreInputs(
    locationId: string,
    factors: Array<{
      factor: string;
      score: number;
      confidence?: number;
      evidence?: string[];
      reasonIds?: string[];
      source?: string;
    }>,
    scenario?: {
      scenarioTitle?: string;
      scenarioSummary?: string;
      trustNotes?: string[];
    }
  ) {
    return this.request<unknown>(`/locations/${locationId}/score-inputs`, {
      method: "PUT",
      body: JSON.stringify({ factors, scenario }),
    });
  }

  recomputeLocationScore(locationId: string) {
    return this.request<unknown>(`/locations/${locationId}/score/recompute`, {
      method: "POST",
    });
  }

  getLocationCampaignHistory(locationId: string, limit = 6) {
    return this.request<{
      campaigns: Array<{
        campaignId: string;
        campaignName: string;
        advertiserName: string;
        planId: string;
        planName: string;
        planStatus: string;
        startDate: string | null;
        endDate: string | null;
        updatedAt: string;
      }>;
      total: number;
    }>(`/locations/${locationId}/campaign-history?limit=${limit}`);
  }

  requestAnalysis(locationId: string, operation?: string) {
    return this.request<unknown>(`/locations/${locationId}/analyses`, {
      method: "POST",
      body: JSON.stringify({ operation }),
    });
  }

  getAnalysis(locationId: string, analysisId: string) {
    return this.request<unknown>(`/locations/${locationId}/analyses/${analysisId}`);
  }

  getUserMe() {
    return this.request<{
      id: string;
      email: string;
      name: string;
      role: string;
      organizationId: string | null;
    }>("/users/me");
  }

  updateUserMe(data: {
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  }) {
    return this.request<unknown>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getPlatformPremiumFormats() {
    return this.request<{ premiumFormats: string[] }>("/platform/premium-formats");
  }

  getPlatformConfig() {
    return this.request<{
      defaultSkyarcMarginPercent: number;
      currency: string;
      showVendorDetailsOnLocationPage: boolean;
      premiumFormats: string[];
    }>("/platform/config");
  }

  updatePlatformConfig(data: {
    defaultSkyarcMarginPercent?: number;
    currency?: string;
    showVendorDetailsOnLocationPage?: boolean;
    premiumFormats?: string[];
  }) {
    return this.request<unknown>("/platform/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getOrganization(id: string) {
    return this.request<unknown>(`/organizations/${id}`);
  }

  updateOrganizationCommercial(
    id: string,
    data: {
      skyarcMarginPercent?: number;
      currency?: string;
      paymentTermsDays?: number;
      notes?: string;
    }
  ) {
    return this.request<unknown>(`/organizations/${id}/commercial`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  listLocationScreens(locationId: string) {
    return this.request<unknown[]>(`/locations/${locationId}/screens`);
  }

  getScreenOrbitStatus(screenId: string) {
    return this.request<{
      attached: boolean;
      skyarcScreenCode?: string | null;
      device?: unknown;
    }>(`/screens/${screenId}/orbit-status`);
  }

  listScreenDevices(screenId: string) {
    return this.request<unknown[]>(`/screens/${screenId}/devices`);
  }

  attachScreenDevice(
    screenId: string,
    body: { provider?: string; deviceType?: string; externalId?: string }
  ) {
    return this.request<unknown>(`/screens/${screenId}/devices`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  createScreen(
    locationId: string,
    data: {
      label: string;
      inventoryStatus?: string;
      loopDurationSec?: number;
      slotDurationSec?: number;
    }
  ) {
    return this.request<unknown>(`/locations/${locationId}/screens`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  listScreenInventories(screenId: string) {
    return this.request<unknown[]>(`/screens/${screenId}/inventories`);
  }

  createInventory(
    screenId: string,
    data: {
      productCode: string;
      inventoryType?: string;
      notes?: string;
      status?: string;
      slotCapacity?: number;
      staticSpecsJson?: Record<string, unknown>;
    }
  ) {
    return this.request<unknown>(`/screens/${screenId}/inventories`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  createRateCard(
    inventoryId: string,
    data: { currency?: string; period: string; amount: number }
  ) {
    return this.request<unknown>(`/inventories/${inventoryId}/rate-cards`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  deleteInventory(inventoryId: string) {
    return this.request<{ deleted: boolean; id: string }>(`/inventories/${inventoryId}`, {
      method: "DELETE",
    });
  }

  updateInventory(
    inventoryId: string,
    data: {
      productCode?: string;
      inventoryType?: string;
      notes?: string;
      status?: string;
      slotCapacity?: number;
      staticSpecsJson?: Record<string, unknown>;
    }
  ) {
    return this.request<unknown>(`/inventories/${inventoryId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  updateScreen(
    screenId: string,
    data: { label?: string; inventoryStatus?: string }
  ) {
    return this.request<unknown>(`/screens/${screenId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  updateLocationCommercial(
    locationId: string,
    data: {
      marginPercent?: number;
      defaultRateAmount?: number;
      ratePeriod?: string;
      currency?: string;
      paymentTermsDays?: number;
      notes?: string;
    }
  ) {
    return this.request<unknown>(`/locations/${locationId}/commercial`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  updateLocationSkyarcCommercial(
    locationId: string,
    data: {
      clientRateAmount?: number;
      ratePeriod?: string;
      currency?: string;
      notes?: string;
      premium?: boolean;
    }
  ) {
    return this.request<unknown>(`/locations/${locationId}/skyarc-commercial`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  bulkApplyLocationCommercial(locationIds: string[]) {
    return this.request<{ updated: number }>("/locations/commercial/bulk-apply", {
      method: "POST",
      body: JSON.stringify({ locationIds }),
    });
  }

  bulkLocationActions(
    locationIds: string[],
    action: "ARCHIVE" | "UNARCHIVE" | "AVAILABLE" | "UNAVAILABLE"
  ) {
    return this.request<{ updated: number; action: string }>("/locations/bulk-actions", {
      method: "POST",
      body: JSON.stringify({ locationIds, action }),
    });
  }

  previewAvailabilityRelease(locationIds: string[], from: string, to: string) {
    return this.request<{
      from: string;
      to: string;
      totalOverlappingWindows: number;
      locations: Array<{
        locationId: string;
        overlappingWindows: Array<{
          id: string;
          status: string;
          startDate: string;
          endDate: string;
          inventoryId: string;
        }>;
        affectedCampaigns: Array<{ id: string; name: string; lifecycleStatus: string }>;
        affectedMediaPlans: Array<{
          id: string;
          name: string;
          status: string;
          campaignId: string;
        }>;
      }>;
    }>("/locations/availability/preview-release", {
      method: "POST",
      body: JSON.stringify({ locationIds, from, to }),
    });
  }

  releaseAvailabilityWindow(
    locationIds: string[],
    from: string,
    to: string,
    reason: string
  ) {
    return this.request<{
      releasedWindows: number;
      updated: number;
    }>("/locations/availability/release", {
      method: "POST",
      body: JSON.stringify({ locationIds, from, to, reason }),
    });
  }

  updateOrganizationMeCommercial(data: {
    defaultMarginPercent?: number;
    defaultRateAmount?: number;
    ratePeriod?: string;
    currency?: string;
    paymentTermsDays?: number;
    notes?: string;
  }) {
    return this.request<unknown>("/organizations/me/commercial", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getOrganizationMe() {
    return this.request<{
      id: string;
      name: string;
      type: string;
      status: string;
      memberCount: number;
      locationCount: number;
      commercialView?: {
        effectiveMarginPercent: number;
        platformDefaultMarginPercent: number;
        paymentTermsDays?: number;
        currency?: string;
      };
      createdAt: string;
      updatedAt: string;
    }>("/organizations/me");
  }

  listOrganizations(page = 1, limit = 20) {
    return this.request<unknown[]>(`/organizations?page=${page}&limit=${limit}`);
  }

  createOrganization(name: string) {
    return this.request<unknown>("/organizations", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  deleteOrganization(id: string) {
    return this.request<{
      id: string;
      removed: boolean;
      name: string;
      message: string;
    }>(`/organizations/${id}`, {
      method: "DELETE",
    });
  }

  forgotPassword(email: string) {
    return this.request<{ ok: boolean; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  resetPassword(token: string, password: string) {
    return this.request<{ ok: boolean; email: string; message: string }>(
      "/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }
    );
  }

  updateOrganizationStatus(id: string, status: string) {
    return this.request<unknown>(`/organizations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  requestVendorAvailability(id: string, data?: { campaignId?: string; notes?: string }) {
    return this.request<{
      organizationId: string;
      organizationName: string;
      requestedAt: string;
      recipientCount: number;
      status: string;
      message: string;
    }>(`/organizations/${id}/request-availability`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  }

  updateUser(id: string, data: { name?: string; email?: string; role?: string; password?: string }) {
    return this.request<unknown>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getUserResetLink(id: string) {
    return this.request<{
      userId: string;
      email: string;
      resetLink: string;
      expiresInDays: number;
      message: string;
    }>(`/users/${id}/reset-link`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  uploadLocationAssetDirect(
    locationId: string,
    fileBuffer: ArrayBuffer | Uint8Array,
    contentType: string,
    view = "FRONT_OF_SCREEN"
  ) {
    return this.request<unknown>(`/locations/${locationId}/assets/upload?view=${encodeURIComponent(view)}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: fileBuffer as any,
    });
  }

  importInventoryBatch(data: {
    vendorOrgName?: string;
    vendorAdminEmail?: string;
    createVendorIfMissing?: boolean;
    items: Array<{
      name: string;
      iid?: string;
      latitude: number;
      longitude: number;
      city?: string;
      district?: string;
      area?: string;
      locationDescription?: string;
      mediaType: string;
      widthFt?: number;
      heightFt?: number;
      sqft?: number;
      lightingType?: string;
      availableFrom?: string;
      cardRateAmount?: number;
      discountedRateAmount?: number;
      ratePeriod?: string;
      premium?: boolean;
      vendorMediaCode?: string;
      skyarcSiteCode?: string;
      state?: string;
    }>;
  }) {
    return this.request<{
      total: number;
      created: number;
      updated: number;
      organizationId: string | null;
      vendorUserCreated?: {
        id: string;
        name: string;
        email: string;
        tempPassword?: string;
        isNewOrg: boolean;
      } | null;
    }>("/inventories/import-batch", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
