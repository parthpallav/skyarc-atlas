export interface PresignUploadInput {
  key: string;
  contentType: string;
  maxBytes: number;
}

export interface PresignUploadResult {
  uploadUrl: string;
  expiresAt: Date;
}

export interface HeadObjectResult {
  contentType: string;
  byteSize: number;
  etag?: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  createPresignedUpload(input: PresignUploadInput): Promise<PresignUploadResult>;
  putObject(input: PutObjectInput): Promise<void>;
  headObject(key: string): Promise<HeadObjectResult | null>;
  createPresignedDownload(key: string): Promise<string>;
}
