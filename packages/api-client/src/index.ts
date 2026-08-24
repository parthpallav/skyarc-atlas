import { API_PREFIX } from "@skyarc/shared";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
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
  constructor(private readonly options: ApiClientOptions) {}

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

    const response = await fetch(`${this.options.baseUrl}${API_PREFIX}${path}`, {
      ...init,
      headers,
    });

    const body = (await response.json()) as ApiResponse<T> | ApiErrorBody;
    if (!response.ok) {
      const err = body as ApiErrorBody;
      throw new Error(err.error?.message ?? "API request failed");
    }
    return body as ApiResponse<T>;
  }

  login(email: string, password: string, deviceLabel?: string) {
    return this.request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string; name: string; role: string };
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

  listLocations(page = 1, limit = 20) {
    return this.request<unknown[]>(`/locations?page=${page}&limit=${limit}`);
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

  listCampaigns(page = 1, limit = 20) {
    return this.request<unknown[]>(`/campaigns?page=${page}&limit=${limit}`);
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

  updateCampaignBrief(campaignId: string, sourceText: string) {
    return this.request<unknown>(`/campaigns/${campaignId}/brief`, {
      method: "PUT",
      body: JSON.stringify({ sourceText }),
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
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
