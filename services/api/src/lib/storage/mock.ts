import type { StorageProvider } from "./types.js";

export function createMockStorage(): StorageProvider {
  const objects = new Map<string, { contentType: string; byteSize: number }>();

  return {
    async createPresignedUpload(input) {
      objects.set(input.key, {
        contentType: input.contentType,
        byteSize: input.maxBytes,
      });
      return {
        uploadUrl: `https://mock-r2.local/upload/${encodeURIComponent(input.key)}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    },

    async putObject(input) {
      objects.set(input.key, {
        contentType: input.contentType,
        byteSize: input.body.length,
      });
    },

    async headObject(key) {
      const obj = objects.get(key);
      if (!obj) return null;
      return { contentType: obj.contentType, byteSize: obj.byteSize };
    },

    async createPresignedDownload(key) {
      return `https://mock-r2.local/download/${encodeURIComponent(key)}`;
    },
  };
}
