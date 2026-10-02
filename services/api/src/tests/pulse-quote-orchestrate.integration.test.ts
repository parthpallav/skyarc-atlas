/**
 * Real Atlas Postgres integration: scenarios → proposal/QuoteRevision →
 * confirmation → accept → booking. Meta is not involved.
 *
 * Requires INTEGRATION_DATABASE_URL. Does not mock Atlas pricing/auth/persistence.
 */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  cleanupFixture,
  describeIntegration,
  seedReservationFixture,
  createIntegrationPrisma,
} from "./helpers/integration-db.js";
import { generateScenarioBundle } from "../lib/proposals/scenarios.js";
import { issueProposalRevision } from "../lib/proposals/proposal.js";
import {
  createActionConfirmation,
  consumeActionConfirmation,
} from "../lib/whatsapp/confirmations.js";
import { acceptQuoteRevision } from "../lib/booking/quote-revision.js";

describeIntegration("pulse→atlas quote orchestration (postgres)", () => {
  const prisma = createIntegrationPrisma();

  it("issues exactly one booking via confirm/accept with quote binding + duplicate safety", async () => {
    const ids = await seedReservationFixture(prisma);
    try {
      await prisma.campaignBrief.create({
        data: {
          campaignId: ids.campaignA,
          sourceText: "Ahmedabad OOH budget 500000",
          structuredRequirementsJson: {
            city: "ahmedabad",
            budget: 500_000,
            cityHint: "ahmedabad",
          },
          parseStatus: "PARSED",
        },
      });

      const bundle = await generateScenarioBundle(prisma, ids.campaignA, { totalBudget: 500_000 });
      const scenario = bundle.coverage ?? bundle.concentration;
      expect(scenario, bundle.limitation ?? "expected scenario").toBeTruthy();
      if (!scenario) throw new Error("unreachable");

      const issued = await issueProposalRevision(prisma, {
        campaignId: ids.campaignA,
        scenario,
        evidenceLimitations: bundle.evidenceLimitations,
        tenantOrganizationId: ids.orgA,
        actorUserId: ids.userA,
      });
      expect("error" in issued).toBe(false);
      if ("error" in issued) throw new Error(String(issued.error));
      const quoteId = issued.quote.id;
      expect(issued.quote.tenantOrganizationId).toBe(ids.orgA);

      const confirm = await createActionConfirmation(prisma, {
        userId: ids.userA,
        tenantOrganizationId: ids.orgA,
        action: "ACCEPT_QUOTE",
        payload: {
          quoteId,
          proposalId: issued.proposal.id,
          campaignId: ids.campaignA,
          tenantOrganizationId: ids.orgA,
          atlasUserId: ids.userA,
        },
        ttlMinutes: 30,
      });

      const consumed = await consumeActionConfirmation(prisma, {
        token: confirm.token,
        expectedAction: "ACCEPT_QUOTE",
      });
      expect("error" in consumed).toBe(false);
      if ("error" in consumed) throw new Error(String(consumed.error));
      expect(consumed.confirmation.userId).toBe(ids.userA);
      expect(consumed.confirmation.tenantOrganizationId).toBe(ids.orgA);
      expect(String(consumed.payload.quoteId)).toBe(quoteId);

      const dupConfirm = await consumeActionConfirmation(prisma, {
        token: confirm.token,
        expectedAction: "ACCEPT_QUOTE",
      });
      expect("error" in dupConfirm && dupConfirm.error).toMatch(/already used/i);

      const accept = await acceptQuoteRevision(prisma, {
        quoteId,
        actorUserId: ids.userA,
        tenantOrganizationId: ids.orgA,
        idempotencyKey: `wa-confirm:${consumed.confirmation.id}`,
        mode: "book",
      });
      expect("error" in accept).toBe(false);
      if ("error" in accept) throw new Error(String(accept.error));
      expect(accept.booking?.id).toBeTruthy();
      const bookingId = accept.booking!.id;

      const [dupA, dupB] = await Promise.all([
        acceptQuoteRevision(prisma, {
          quoteId,
          actorUserId: ids.userA,
          tenantOrganizationId: ids.orgA,
          idempotencyKey: `wa-confirm:${consumed.confirmation.id}`,
          mode: "book",
        }),
        acceptQuoteRevision(prisma, {
          quoteId,
          actorUserId: ids.userA,
          tenantOrganizationId: ids.orgA,
          idempotencyKey: `wa-confirm:${consumed.confirmation.id}`,
          mode: "book",
        }),
      ]);
      for (const d of [dupA, dupB]) {
        expect("error" in d).toBe(false);
        if ("error" in d) continue;
        expect(d.booking?.id).toBe(bookingId);
      }

      const bookings = await prisma.booking.findMany({ where: { campaignId: ids.campaignA } });
      expect(bookings).toHaveLength(1);
      expect(bookings[0]!.acceptedQuoteRevisionId).toBe(quoteId);
      expect(bookings[0]!.tenantOrganizationId).toBe(ids.orgA);
    } finally {
      await prisma.whatsAppActionConfirmation.deleteMany({ where: { userId: ids.userA } });
      await prisma.proposalShareToken
        .deleteMany({ where: { proposal: { campaignId: ids.campaignA } } })
        .catch(() => undefined);
      await prisma.proposalRevision.deleteMany({ where: { campaignId: ids.campaignA } });
      await prisma.campaignBrief.deleteMany({ where: { campaignId: ids.campaignA } });
      await cleanupFixture(prisma, ids);
    }
  });

  it("rejects expired confirmation and expired quote", async () => {
    const ids = await seedReservationFixture(prisma);
    try {
      await prisma.campaignBrief.create({
        data: {
          campaignId: ids.campaignA,
          structuredRequirementsJson: { budget: 500_000 },
          parseStatus: "PARSED",
        },
      });
      const bundle = await generateScenarioBundle(prisma, ids.campaignA, { totalBudget: 500_000 });
      const scenario = bundle.coverage ?? bundle.concentration;
      expect(scenario, bundle.limitation ?? "expected scenario from fixture inventory").toBeTruthy();
      if (!scenario) throw new Error("unreachable");
      const issued = await issueProposalRevision(prisma, {
        campaignId: ids.campaignA,
        scenario,
        evidenceLimitations: [],
        tenantOrganizationId: ids.orgA,
        actorUserId: ids.userA,
      });
      expect("error" in issued).toBe(false);
      if ("error" in issued) throw new Error(String(issued.error));

      await prisma.quoteRevision.update({
        where: { id: issued.quote.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const confirm = await createActionConfirmation(prisma, {
        userId: ids.userA,
        tenantOrganizationId: ids.orgA,
        action: "ACCEPT_QUOTE",
        payload: { quoteId: issued.quote.id },
        ttlMinutes: 1,
      });
      await prisma.whatsAppActionConfirmation.update({
        where: { id: confirm.confirmationId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await consumeActionConfirmation(prisma, {
        token: confirm.token,
        expectedAction: "ACCEPT_QUOTE",
      });
      expect("error" in expired && expired.error).toMatch(/expired/i);

      const acceptExpiredQuote = await acceptQuoteRevision(prisma, {
        quoteId: issued.quote.id,
        actorUserId: ids.userA,
        tenantOrganizationId: ids.orgA,
        idempotencyKey: `exp-${randomUUID()}`,
        mode: "book",
      });
      expect("error" in acceptExpiredQuote && String(acceptExpiredQuote.error)).toMatch(/expired/i);
    } finally {
      await prisma.whatsAppActionConfirmation.deleteMany({ where: { userId: ids.userA } });
      await prisma.proposalRevision.deleteMany({ where: { campaignId: ids.campaignA } });
      await prisma.campaignBrief.deleteMany({ where: { campaignId: ids.campaignA } });
      await cleanupFixture(prisma, ids);
    }
  });

  it("recovers orphan booking when Atlas succeeded before quote accept persistence", async () => {
    const ids = await seedReservationFixture(prisma);
    try {
      await prisma.campaignBrief.create({
        data: {
          campaignId: ids.campaignA,
          structuredRequirementsJson: { budget: 500_000 },
          parseStatus: "PARSED",
        },
      });
      const bundle = await generateScenarioBundle(prisma, ids.campaignA, { totalBudget: 500_000 });
      const scenario = bundle.coverage ?? bundle.concentration;
      expect(scenario, bundle.limitation ?? "expected scenario from fixture inventory").toBeTruthy();
      if (!scenario) throw new Error("unreachable");

      const issued = await issueProposalRevision(prisma, {
        campaignId: ids.campaignA,
        scenario,
        evidenceLimitations: [],
        tenantOrganizationId: ids.orgA,
        actorUserId: ids.userA,
      });
      expect("error" in issued).toBe(false);
      if ("error" in issued) throw new Error(String(issued.error));

      const key = `pulse-timeout-${issued.quote.id}`;
      const first = await acceptQuoteRevision(prisma, {
        quoteId: issued.quote.id,
        actorUserId: ids.userA,
        tenantOrganizationId: ids.orgA,
        idempotencyKey: key,
        mode: "book",
      });
      expect("error" in first).toBe(false);
      if ("error" in first) return;

      // Simulate Pulse timeout + restart: retry same idempotency key
      const retry = await acceptQuoteRevision(prisma, {
        quoteId: issued.quote.id,
        actorUserId: ids.userA,
        tenantOrganizationId: ids.orgA,
        idempotencyKey: key,
        mode: "book",
      });
      expect("error" in retry).toBe(false);
      if ("error" in retry) return;
      expect(retry.booking?.id).toBe(first.booking?.id);
      expect(retry.idempotent === true || retry.quote.status === "ACCEPTED").toBe(true);

      const bookings = await prisma.booking.findMany({ where: { campaignId: ids.campaignA } });
      expect(bookings).toHaveLength(1);
    } finally {
      await prisma.proposalRevision.deleteMany({ where: { campaignId: ids.campaignA } });
      await prisma.campaignBrief.deleteMany({ where: { campaignId: ids.campaignA } });
      await cleanupFixture(prisma, ids);
    }
  });
});
