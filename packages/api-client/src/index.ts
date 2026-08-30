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
      !path.startsWith("/auth/refresh")
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
      !path.startsWith("/auth/refresh")
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
    filters?: { q?: string; status?: string; type?: string }
  ) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (scope) params.set("scope", scope);
    if (filters?.q) params.set("q", filters.q);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.type) params.set("type", filters.type);
    return this.request<unknown[]>(`/locations?${params.toString()}`);
  }

  createLocation(data: Record<string, unknown>) {
    return this.request<unknown>("/locations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getLocation(id: string) {
    return this.request<unknown>(`/locations/${id}`);
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

  createCampaign(data: Record<string, unknown>) {
    return this.request<unknown>("/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
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

  optimizeMediaPlan(
    campaignId: string,
    data: { name?: string; totalBudget: number; maxLocations?: number }
  ) {
    return this.request<unknown>(`/campaigns/${campaignId}/media-plans/optimize`, {
      method: "POST",
      body: JSON.stringify(data),
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
    return this.request<unknown | null>(`/locations/${locationId}/score`);
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

  getPlatformConfig() {
    return this.request<{ defaultSkyarcMarginPercent: number; currency: string }>(
      "/platform/config"
    );
  }

  updatePlatformConfig(data: { defaultSkyarcMarginPercent?: number; currency?: string }) {
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
