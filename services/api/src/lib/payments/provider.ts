import { validationError } from "../errors.js";
import { testPaymentAdapter } from "./test-provider.js";
import type { PaymentAdapter, PaymentProviderName } from "./types.js";

export function resolvePaymentsProvider(): PaymentProviderName {
  const raw = (process.env.PAYMENTS_PROVIDER ?? "test").toLowerCase();
  if (raw === "off" || raw === "disabled" || raw === "false") return "disabled";
  if (raw === "test") return "test";
  return "disabled";
}

export function getPaymentAdapter(): PaymentAdapter {
  const name = resolvePaymentsProvider();
  if (name === "test") return testPaymentAdapter;
  throw validationError("Live checkout is disabled until provider credentials are verified");
}
