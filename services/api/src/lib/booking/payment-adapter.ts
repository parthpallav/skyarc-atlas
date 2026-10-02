/**
 * Payment provider adapter — server-side events only.
 * Live verification stays pending until credentials are configured.
 * Never treat mocked success as captured payment.
 */

export type PaymentProviderName = "none" | "razorpay" | "stripe";

export type PaymentIntentInput = {
  bookingId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
};

export type PaymentIntentResult =
  | {
      status: "UNAVAILABLE";
      reason: string;
      provider: PaymentProviderName;
    }
  | {
      status: "CREATED";
      provider: PaymentProviderName;
      providerIntentId: string;
      clientSecret?: string;
    };

export type VerifiedPaymentEvent = {
  provider: PaymentProviderName;
  providerEventId: string;
  providerIntentId: string;
  type: "authorized" | "captured" | "failed" | "refunded";
  amountMinor: number;
  currency: string;
  raw: unknown;
};

export interface PaymentProviderAdapter {
  readonly name: PaymentProviderName;
  isConfigured(): boolean;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  /** Verify webhook/signature and normalize — never invent success. */
  verifyAndParseEvent(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): Promise<VerifiedPaymentEvent | { error: string }>;
}

export class UnavailablePaymentAdapter implements PaymentProviderAdapter {
  readonly name: PaymentProviderName = "none";

  isConfigured(): boolean {
    return false;
  }

  async createIntent(_input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      status: "UNAVAILABLE",
      reason:
        "Payment credentials not configured. Paid checkout disabled until a provider is wired.",
      provider: this.name,
    };
  }

  async verifyAndParseEvent(): Promise<{ error: string }> {
    return { error: "Payment provider not configured" };
  }
}

/**
 * Resolve adapter from env. Without credentials, returns UNAVAILABLE adapter.
 * Razorpay/Stripe keys: RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET or STRIPE_SECRET_KEY.
 */
export function resolvePaymentAdapter(): PaymentProviderAdapter {
  const razorpayId = process.env.RAZORPAY_KEY_ID?.trim();
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (razorpayId && razorpaySecret) {
    // Credentials present but live adapter not yet implemented — refuse mocked success
    return {
      name: "razorpay",
      isConfigured: () => true,
      createIntent: async () => ({
        status: "UNAVAILABLE",
        reason:
          "Razorpay credentials detected but live intent creation is not enabled in this build. Paid checkout remains pending.",
        provider: "razorpay",
      }),
      verifyAndParseEvent: async () => ({
        error: "Razorpay webhook verification not enabled in this build",
      }),
    };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (stripeKey) {
    return {
      name: "stripe",
      isConfigured: () => true,
      createIntent: async () => ({
        status: "UNAVAILABLE",
        reason:
          "Stripe credentials detected but live intent creation is not enabled in this build. Paid checkout remains pending.",
        provider: "stripe",
      }),
      verifyAndParseEvent: async () => ({
        error: "Stripe webhook verification not enabled in this build",
      }),
    };
  }

  return new UnavailablePaymentAdapter();
}

/**
 * Policy notes (must hold before enabling paid checkout):
 * - Hold expiry continues independently of payment status.
 * - Delayed payment success after hold expiry must not auto-confirm without fresh capacity.
 * - Refunds/compensation are separate from BookingExecutionStatus.
 * - BookingPaymentStatus stays NOT_REQUIRED / UNAVAILABLE until provider confirms delivery.
 */
export const PAYMENT_POLICY = {
  holdExpiryIndependentOfPayment: true,
  delayedCaptureRequiresFreshCapacity: true,
  refundSeparateFromExecution: true,
} as const;
