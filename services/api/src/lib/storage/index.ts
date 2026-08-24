import type { Env } from "@skyarc/config";
import { createMockStorage } from "./mock.js";
import { createR2Storage } from "./r2.js";
import type { StorageProvider } from "./types.js";

export function createStorageProvider(env: Env): StorageProvider {
  if (
    env.R2_ENDPOINT &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY
  ) {
    return createR2Storage(env);
  }
  return createMockStorage();
}

export type { StorageProvider } from "./types.js";
