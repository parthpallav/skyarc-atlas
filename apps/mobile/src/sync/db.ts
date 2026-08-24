import * as SQLite from "expo-sqlite";
import { SyncState } from "@skyarc/shared";

export type OutboxType =
  | "UPSERT_LOCATION"
  | "PRESIGN_ASSET"
  | "UPLOAD_R2"
  | "CONFIRM_ASSET"
  | "UPSERT_SURVEY"
  | "REQUEST_ANALYSIS";

export interface OutboxRow {
  id: string;
  type: OutboxType;
  payloadJson: string;
  state: SyncState;
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("skyarc_atlas.db");
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        nextRetryAt INTEGER,
        lastError TEXT
      );
      CREATE TABLE IF NOT EXISTS local_locations (
        id TEXT PRIMARY KEY NOT NULL,
        payloadJson TEXT NOT NULL,
        syncState TEXT NOT NULL DEFAULT 'PENDING',
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_assets (
        id TEXT PRIMARY KEY NOT NULL,
        locationId TEXT NOT NULL,
        kind TEXT NOT NULL,
        fileUri TEXT NOT NULL,
        checksum TEXT,
        syncState TEXT NOT NULL DEFAULT 'PENDING',
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_surveys (
        locationId TEXT PRIMARY KEY NOT NULL,
        payloadJson TEXT NOT NULL,
        syncState TEXT NOT NULL DEFAULT 'PENDING',
        updatedAt INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export async function enqueueOutbox(
  id: string,
  type: OutboxType,
  payload: Record<string, unknown>
) {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO outbox (id, type, payloadJson, state, attempts, nextRetryAt, lastError)
     VALUES (?, ?, ?, ?, 0, NULL, NULL)`,
    [id, type, JSON.stringify(payload), SyncState.PENDING]
  );
}

export async function getPendingOutbox(): Promise<OutboxRow[]> {
  const database = await getDb();
  const now = Date.now();
  return database.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox
     WHERE state IN ('PENDING', 'FAILED', 'RETRYING')
       AND (nextRetryAt IS NULL OR nextRetryAt <= ?)
     ORDER BY rowid ASC`,
    [now]
  );
}

export async function updateOutboxState(
  id: string,
  state: SyncState,
  lastError?: string
) {
  const database = await getDb();
  const attempts =
    state === SyncState.FAILED || state === SyncState.RETRYING
      ? `attempts + 1`
      : `attempts`;
  await database.runAsync(
    `UPDATE outbox SET state = ?, lastError = ?, attempts = ${attempts},
      nextRetryAt = CASE WHEN ? IN ('FAILED', 'RETRYING') THEN ? ELSE NULL END
     WHERE id = ?`,
    [
      state,
      lastError ?? null,
      state,
      Date.now() + 30_000,
      id,
    ]
  );
}

export async function removeOutbox(id: string) {
  const database = await getDb();
  await database.runAsync(`DELETE FROM outbox WHERE id = ?`, [id]);
}

export async function saveLocalLocation(id: string, payload: Record<string, unknown>) {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO local_locations (id, payloadJson, syncState, updatedAt)
     VALUES (?, ?, ?, ?)`,
    [id, JSON.stringify(payload), SyncState.PENDING, Date.now()]
  );
}

export async function listLocalLocations() {
  const database = await getDb();
  return database.getAllAsync<{ id: string; payloadJson: string; syncState: string }>(
    `SELECT id, payloadJson, syncState FROM local_locations ORDER BY updatedAt DESC`
  );
}

export async function saveLocalAsset(
  id: string,
  locationId: string,
  kind: string,
  fileUri: string,
  checksum?: string
) {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO local_assets (id, locationId, kind, fileUri, checksum, syncState, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, locationId, kind, fileUri, checksum ?? null, SyncState.PENDING, Date.now()]
  );
}

export async function saveLocalSurvey(locationId: string, payload: Record<string, unknown>) {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO local_surveys (locationId, payloadJson, syncState, updatedAt)
     VALUES (?, ?, ?, ?)`,
    [locationId, JSON.stringify(payload), SyncState.PENDING, Date.now()]
  );
}
