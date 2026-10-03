import { isInternalUser, isVendorUser } from "@skyarc/shared";

/**
 * Feature gate — AdTech booking/quote/payment APIs are opt-in.
 * Set ADTECH_BOOKING=true to enable. Default off so production keeps classic planning.
 */
export function isAdtechBookingEnabled(): boolean {
  return process.env.ADTECH_BOOKING === "true";
}

export type BookingSerializeInput = {
  id: string;
  tenantOrganizationId: string | null;
  campaignId: string;
  mediaPlanId: string | null;
  status: string;
  paymentStatus: string;
  executionStatus: string;
  startDate: Date;
  endDate: Date;
  expiresAt: Date | null;
  idempotencyKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Array<{
    id: string;
    inventoryId: string;
    availabilityWindowId: string | null;
    vendorOrganizationId: string | null;
    status: string;
    slotsConsumed: number;
    mediaPlanItemId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  transitions?: Array<{
    id: string;
    bookingItemId: string | null;
    fromStatus: string;
    toStatus: string;
    actorUserId: string | null;
    reason: string | null;
    createdAt: Date;
  }>;
  campaign?: { id: string; name: string; lifecycleStatus: string } | null;
  paymentIntents?: Array<{
    id: string;
    status: string;
    amountMinor: number;
    currency: string;
    provider: string;
    providerRef: string | null;
    createdAt: Date;
  }>;
  creatives?: Array<{
    id: string;
    status: string;
    assetUrl: string | null;
    fileName: string | null;
    submittedAt: Date | null;
  }>;
};

export function serializeBooking(booking: BookingSerializeInput) {
  return {
    id: booking.id,
    tenantOrganizationId: booking.tenantOrganizationId,
    campaignId: booking.campaignId,
    mediaPlanId: booking.mediaPlanId,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    idempotencyKey: booking.idempotencyKey,
    createdByUserId: booking.createdByUserId,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    campaign: booking.campaign
      ? {
          id: booking.campaign.id,
          name: booking.campaign.name,
          lifecycleStatus: booking.campaign.lifecycleStatus,
        }
      : undefined,
    items: (booking.items ?? []).map((item) => ({
      id: item.id,
      inventoryId: item.inventoryId,
      availabilityWindowId: item.availabilityWindowId,
      vendorOrganizationId: item.vendorOrganizationId,
      status: item.status,
      slotsConsumed: item.slotsConsumed,
      mediaPlanItemId: item.mediaPlanItemId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    transitions: (booking.transitions ?? []).map((t) => ({
      id: t.id,
      bookingItemId: t.bookingItemId,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      actorUserId: t.actorUserId,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
    paymentIntents: (booking.paymentIntents ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      amountMinor: p.amountMinor,
      currency: p.currency,
      provider: p.provider,
      providerRef: p.providerRef,
      createdAt: p.createdAt.toISOString(),
    })),
    creatives: (booking.creatives ?? []).map((c) => ({
      id: c.id,
      status: c.status,
      assetUrl: c.assetUrl,
      fileName: c.fileName,
      submittedAt: c.submittedAt?.toISOString() ?? null,
    })),
  };
}

export function bookingTenantWhere(user: { organizationId?: string | null; role: string }) {
  if (isInternalUser(user as never)) return {};
  if (isVendorUser(user as never) && user.organizationId) {
    return {
      OR: [
        { tenantOrganizationId: user.organizationId },
        { items: { some: { vendorOrganizationId: user.organizationId } } },
      ],
    };
  }
  if (user.organizationId) {
    return { tenantOrganizationId: user.organizationId };
  }
  return { id: "__none__" };
}

export const bookingDetailInclude = {
  items: true,
  transitions: { orderBy: { createdAt: "asc" as const }, take: 200 },
  campaign: { select: { id: true, name: true, lifecycleStatus: true } },
  paymentIntents: { orderBy: { createdAt: "desc" as const }, take: 20 },
  creatives: { orderBy: { createdAt: "desc" as const }, take: 20 },
};
