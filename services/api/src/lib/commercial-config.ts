import {
  DEFAULT_PLATFORM_CONFIG,
  parseOrganizationCommercial,
  parsePlatformConfig,
  resolveMarginPercent,
} from "@skyarc/shared";
import { prisma } from "./prisma.js";

export async function loadPlatformConfig() {
  const row = await prisma.platformConfig.findUnique({ where: { id: "default" } });
  return parsePlatformConfig(row?.data ?? DEFAULT_PLATFORM_CONFIG);
}

export async function resolveOrganizationMarginPercent(organizationId: string | null) {
  const platform = await loadPlatformConfig();
  if (!organizationId) {
    return platform.defaultSkyarcMarginPercent;
  }
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { commercialJson: true },
  });
  const commercial = parseOrganizationCommercial(org?.commercialJson);
  return resolveMarginPercent(commercial, platform);
}
