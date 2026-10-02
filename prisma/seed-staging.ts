/**
 * Isolated staging seed — two tenant orgs + representative roles.
 * Requires STAGING_SEED_CONFIRM=1. Never run against production DATABASE_URL.
 */
import {
  OrganizationType,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const TENANT_ALPHA = "00000000-0000-4000-8000-000000000101";
const TENANT_BETA = "00000000-0000-4000-8000-000000000102";
const SKYARC_INTERNAL = "00000000-0000-4000-8000-000000000001";
const VENDOR_ALPHA = "00000000-0000-4000-8000-000000000103";
const VENDOR_BETA = "00000000-0000-4000-8000-000000000104";

async function main() {
  if (process.env.STAGING_SEED_CONFIRM !== "1") {
    throw new Error("Set STAGING_SEED_CONFIRM=1 to seed staging (safety guard).");
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (/skyarc_atlas_staging/i.test(dbUrl) === false && !process.env.STAGING_ALLOW_NON_STAGING_DB) {
    console.warn(
      "WARNING: DATABASE_URL does not contain skyarc_atlas_staging. Set STAGING_ALLOW_NON_STAGING_DB=1 to override."
    );
    throw new Error("Refusing to seed non-staging database name.");
  }

  const password = process.env.STAGING_USER_PASSWORD ?? "StagingTest2026!";
  const hash = await argon2.hash(password);

  await prisma.organization.upsert({
    where: { id: SKYARC_INTERNAL },
    update: { name: "Skyarc Media (Staging Ops)" },
    create: {
      id: SKYARC_INTERNAL,
      name: "Skyarc Media (Staging Ops)",
      type: OrganizationType.INTERNAL,
    },
  });

  await prisma.organization.upsert({
    where: { id: TENANT_ALPHA },
    update: { name: "Staging Tenant Alpha — FMCG", type: OrganizationType.CLIENT },
    create: {
      id: TENANT_ALPHA,
      name: "Staging Tenant Alpha — FMCG",
      type: OrganizationType.CLIENT,
    },
  });

  await prisma.organization.upsert({
    where: { id: TENANT_BETA },
    update: { name: "Staging Tenant Beta — Realty", type: OrganizationType.CLIENT },
    create: {
      id: TENANT_BETA,
      name: "Staging Tenant Beta — Realty",
      type: OrganizationType.CLIENT,
    },
  });

  await prisma.organization.upsert({
    where: { id: VENDOR_ALPHA },
    update: { name: "Staging Vendor Alpha Outdoor", type: OrganizationType.VENDOR },
    create: {
      id: VENDOR_ALPHA,
      name: "Staging Vendor Alpha Outdoor",
      type: OrganizationType.VENDOR,
      commercialJson: { currency: "INR", paymentTermsDays: 30 },
    },
  });

  await prisma.organization.upsert({
    where: { id: VENDOR_BETA },
    update: { name: "Staging Vendor Beta Outdoor", type: OrganizationType.VENDOR },
    create: {
      id: VENDOR_BETA,
      name: "Staging Vendor Beta Outdoor",
      type: OrganizationType.VENDOR,
      commercialJson: { currency: "INR", paymentTermsDays: 30 },
    },
  });

  const users: Array<{
    email: string;
    name: string;
    role: UserRole;
    organizationId: string;
  }> = [
    {
      email: "staging-admin@skyarcads.com",
      name: "Staging Superadmin",
      role: UserRole.SUPERADMIN,
      organizationId: SKYARC_INTERNAL,
    },
    {
      email: "staging-planner@skyarcads.com",
      name: "Staging Media Planner",
      role: UserRole.MEDIA_PLANNER,
      organizationId: SKYARC_INTERNAL,
    },
    {
      email: "staging-vendor-alpha@skyarcads.com",
      name: "Staging Vendor Alpha",
      role: UserRole.VENDOR,
      organizationId: VENDOR_ALPHA,
    },
    {
      email: "staging-vendor-beta@skyarcads.com",
      name: "Staging Vendor Beta",
      role: UserRole.VENDOR,
      organizationId: VENDOR_BETA,
    },
    {
      email: "staging-customer-alpha@skyarcads.com",
      name: "Staging Customer Alpha",
      role: UserRole.CLIENT_VIEWER,
      organizationId: TENANT_ALPHA,
    },
    {
      email: "staging-customer-beta@skyarcads.com",
      name: "Staging Customer Beta",
      role: UserRole.CLIENT_VIEWER,
      organizationId: TENANT_BETA,
    },
    {
      email: "staging-operator@skyarcads.com",
      name: "Staging Field Operator",
      role: UserRole.FIELD_OPERATOR,
      organizationId: SKYARC_INTERNAL,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        organizationId: u.organizationId,
        passwordHash: hash,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        organizationId: u.organizationId,
        passwordHash: hash,
      },
    });
  }

  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: { data: { defaultSkyarcMarginPercent: 15, currency: "INR", environment: "staging" } },
    create: { id: "default", data: { defaultSkyarcMarginPercent: 15, currency: "INR", environment: "staging" } },
  });

  console.log("Staging orgs + users seeded.");
  console.log("  Tenant Alpha (client):", TENANT_ALPHA);
  console.log("  Tenant Beta (client):", TENANT_BETA);
  console.log("  Password (all staging users):", password);
  console.log("Next: run inventory seed on staging DB only, e.g.:");
  console.log("  DATABASE_URL=... tsx prisma/seed-rajkot-hoardings.ts");
  console.log("  DATABASE_URL=... tsx prisma/seed-demo-campaign.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
