import { describe, expect, it } from "vitest";
import {
  hashLinkToken,
  normalizeE164,
} from "../lib/whatsapp/account-link.js";
import {
  hashConfirmationToken,
  proposalFingerprint,
} from "../lib/whatsapp/confirmations.js";

describe("whatsapp link + confirmation tokens", () => {
  it("hashes deterministically and normalizes phones", () => {
    expect(hashLinkToken("abc")).toBe(hashLinkToken("abc"));
    expect(hashLinkToken("abc")).not.toBe(hashLinkToken("abcd"));
    expect(normalizeE164("+91 98765-43210")).toBe("919876543210");
  });

  it("fingerprints proposed actions so payload changes invalidate confirmations", () => {
    const a = proposalFingerprint("ACCEPT_QUOTE", { quoteId: "q1" });
    const b = proposalFingerprint("ACCEPT_QUOTE", { quoteId: "q2" });
    expect(a).not.toBe(b);
    expect(hashConfirmationToken("tok")).toHaveLength(64);
  });
});
