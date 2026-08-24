import NetInfo from "@react-native-community/netinfo";
import { AssetKind, SyncState } from "@skyarc/shared";
import { getApiClient } from "../lib/auth";
import {
  enqueueOutbox,
  getPendingOutbox,
  removeOutbox,
  updateOutboxState,
  saveLocalLocation,
  saveLocalAsset,
  saveLocalSurvey,
  type OutboxType,
} from "./db";

const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 120_000;
}

async function processOutboxItem(
  id: string,
  type: OutboxType,
  payload: Record<string, unknown>
): Promise<void> {
  const client = getApiClient();

  switch (type) {
    case "UPSERT_LOCATION": {
      await client.createLocation(payload);
      break;
    }
    case "PRESIGN_ASSET": {
      const locationId = payload.locationId as string;
      const presign = await client.presignAsset(locationId, payload);
      await updateOutboxState(`${id}-upload`, SyncState.PENDING);
      await enqueueOutbox(`${id}-upload`, "UPLOAD_R2", {
        ...payload,
        uploadUrl: presign.data.uploadUrl,
        assetId: presign.data.assetId,
      });
      break;
    }
    case "UPLOAD_R2": {
      const uploadUrl = payload.uploadUrl as string;
      const fileUri = payload.fileUri as string;
      const contentType = payload.contentType as string;
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed: ${uploadResponse.status}`);
      }
      await enqueueOutbox(`${id}-confirm`, "CONFIRM_ASSET", payload);
      break;
    }
    case "CONFIRM_ASSET": {
      const locationId = payload.locationId as string;
      const assetId = payload.assetId as string;
      await client.confirmAsset(locationId, assetId, {
        checksumSha256: payload.checksumSha256 as string | undefined,
        byteSize: payload.byteSize as number | undefined,
      });
      break;
    }
    case "UPSERT_SURVEY": {
      const locationId = payload.locationId as string;
      await client.upsertSurvey(locationId, payload.survey as Record<string, unknown>);
      break;
    }
    case "REQUEST_ANALYSIS": {
      const locationId = payload.locationId as string;
      await client.requestAnalysis(locationId);
      break;
    }
    default:
      throw new Error(`Unknown outbox type: ${type}`);
  }
}

let syncing = false;

export async function runSync(): Promise<{ processed: number; failed: number }> {
  if (syncing) return { processed: 0, failed: 0 };
  syncing = true;
  let processed = 0;
  let failed = 0;

  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return { processed: 0, failed: 0 };

    const items = await getPendingOutbox();
    for (const item of items) {
      try {
        await updateOutboxState(item.id, SyncState.UPLOADING);
        const payload = JSON.parse(item.payloadJson) as Record<string, unknown>;
        await processOutboxItem(item.id, item.type, payload);
        await removeOutbox(item.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Sync failed";
        const nextState =
          item.attempts >= 4 ? SyncState.FAILED : SyncState.RETRYING;
        await updateOutboxState(item.id, nextState, message);
        if (nextState === SyncState.RETRYING) {
          await new Promise((r) => setTimeout(r, backoff(item.attempts)));
        }
      }
    }
  } finally {
    syncing = false;
  }

  return { processed, failed };
}

export function startSyncListener(intervalMs = 15_000): () => void {
  const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
    if (state.isConnected) {
      void runSync();
    }
  });

  const timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

export async function queueLocationUpsert(
  locationId: string,
  data: Record<string, unknown>
) {
  await saveLocalLocation(locationId, data);
  await enqueueOutbox(`loc-${locationId}`, "UPSERT_LOCATION", { id: locationId, ...data });
}

export async function queueAssetUpload(
  assetId: string,
  locationId: string,
  kind: AssetKind,
  fileUri: string,
  contentType: string,
  byteSize: number,
  checksumSha256?: string,
  view?: string
) {
  await saveLocalAsset(assetId, locationId, kind, fileUri, checksumSha256);
  await enqueueOutbox(`asset-${assetId}`, "PRESIGN_ASSET", {
    locationId,
    assetId,
    kind,
    view,
    contentType,
    byteSize,
    checksumSha256,
    fileUri,
  });
}

export async function queueSurvey(
  locationId: string,
  survey: Record<string, unknown>
) {
  await saveLocalSurvey(locationId, survey);
  await enqueueOutbox(`survey-${locationId}`, "UPSERT_SURVEY", {
    locationId,
    survey,
  });
}

export async function queueAnalysis(locationId: string) {
  await enqueueOutbox(`analysis-${locationId}`, "REQUEST_ANALYSIS", { locationId });
}
