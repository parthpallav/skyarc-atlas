export type PaymentProviderName = "test" | "disabled";

export type CreateIntentInput = {
  quoteRevisionId: string;
  idempotencyKey: string;
  userId: string;
};

export type CreateIntentResult = {
  paymentIntentId: string;
  provider: PaymentProviderName;
  providerRef: string;
  amountMinor: number;
  currency: string;
  status: string;
  /** Sandbox-only: client may POST this to simulate webhook capture. */
  testCaptureToken?: string;
};

export type WebhookVerifyResult = {
  valid: boolean;
  eventType: string;
  providerEventId: string;
  paymentIntentId?: string;
  providerRef?: string;
  payload: Record<string, unknown>;
};

export interface PaymentAdapter {
  name: PaymentProviderName;
  createIntent(input: {
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ providerRef: string; clientSecret?: string }>;
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookVerifyResult;
}
