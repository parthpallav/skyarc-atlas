/**
 * Lunar MVP command / config tracking.
 * PUBACK is transport-only. Execution outcomes come from command-ack + configVersion.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import {
  OrbitLunarAckStatus,
  OrbitLunarCommandName,
  orbitLunarMqttTopic,
} from "@skyarc/shared";
import {
  buildLunarCommandEnvelope,
  buildLunarConfigEnvelope,
  isMvpCommand,
} from "./lunar-envelope.js";

type Db = PrismaClient;

export async function issueCommand(
  db: Db,
  input: {
    deviceId: string;
    tenantId: string;
    physicalDeviceId: string;
    command: string;
    parameters?: Record<string, unknown>;
    expiresAt?: Date | null;
    /** When true, reject if expiresAt is in the past (proposed; default off unless set). */
    enableExpiry?: boolean;
  }
) {
  if (!isMvpCommand(input.command)) {
    return {
      error: "rejected" as const,
      reason: `Command ${input.command} is not an established MVP capability (camera/OTA/player deferred)`,
    };
  }

  if (input.enableExpiry && input.expiresAt && input.expiresAt.getTime() < Date.now()) {
    return { error: "rejected" as const, reason: "Command already expired" };
  }

  const commandId = randomUUID();
  const messageId = `msg_cmd_${commandId}`;
  const awaitBoot = input.command === OrbitLunarCommandName.RESTART;

  const row = await db.orbitCommand.create({
    data: {
      commandId,
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      command: input.command,
      parametersJson: (input.parameters ?? {}) as Prisma.InputJsonValue,
      messageId,
      outcome: "accepted",
      expiresAt: input.expiresAt ?? null,
      awaitBootCompletion: awaitBoot,
    },
  });

  const envelope = buildLunarCommandEnvelope({
    physicalDeviceId: input.physicalDeviceId,
    commandId,
    command: input.command,
    parameters: input.parameters,
    messageId,
    expiresAt: input.enableExpiry && input.expiresAt ? input.expiresAt.toISOString() : null,
  });

  return {
    command: row,
    topic: orbitLunarMqttTopic(input.physicalDeviceId, "commands"),
    envelope,
    note: "PUBACK is transport acknowledgment only — wait for command-ack outcomes",
  };
}

export async function issueConfig(
  db: Db,
  input: {
    deviceId: string;
    physicalDeviceId: string;
    configVersion: number;
    config: Record<string, unknown>;
  }
) {
  const device = await db.orbitDevice.findUnique({ where: { id: input.deviceId } });
  if (!device) return { error: "device_not_found" as const };
  if (input.configVersion <= device.appliedConfigVersion) {
    return {
      error: "rejected_stale" as const,
      reason: `configVersion ${input.configVersion} <= applied ${device.appliedConfigVersion}`,
    };
  }

  const messageId = `msg_cfg_${input.configVersion}_${randomUUID().slice(0, 8)}`;
  const row = await db.orbitDeviceConfig.create({
    data: {
      deviceId: input.deviceId,
      configVersion: input.configVersion,
      configJson: input.config as Prisma.InputJsonValue,
      messageId,
      status: "pending",
    },
  });

  const envelope = buildLunarConfigEnvelope({
    physicalDeviceId: input.physicalDeviceId,
    configVersion: input.configVersion,
    config: input.config,
    messageId,
  });

  return {
    config: row,
    topic: orbitLunarMqttTopic(input.physicalDeviceId, "config"),
    envelope,
    note: "sync_config completes only after device applies and acks matching configVersion",
  };
}

/**
 * Apply command-ack. Duplicate commandId execution: re-record ack, do not re-issue side effects.
 * Restart COMPLETED after boot correlates via saved commandId.
 */
export async function applyCommandAck(
  db: Db,
  input: {
    deviceId: string;
    messageId: string;
    commandId: string;
    status: string;
    observedAt: Date;
    receivedAt: Date;
    payload: Record<string, unknown>;
  }
) {
  try {
    await db.orbitCommandAck.create({
      data: {
        commandId: input.commandId,
        deviceId: input.deviceId,
        messageId: input.messageId,
        status: input.status,
        observedAt: input.observedAt,
        receivedAt: input.receivedAt,
        payloadJson: input.payload as Prisma.InputJsonValue,
      },
    });
  } catch {
    return { duplicate: true as const };
  }

  const cmd = await db.orbitCommand.findUnique({
    where: {
      deviceId_commandId: { deviceId: input.deviceId, commandId: input.commandId },
    },
  });
  if (!cmd) {
    return { orphanAck: true as const, note: "Ack for unknown commandId — stored for investigation" };
  }

  // Expiry (proposed): when enabled and ACCEPTED/EXECUTING after expiry → reject path
  if (
    cmd.expiresAt &&
    cmd.expiresAt.getTime() < input.receivedAt.getTime() &&
    (input.status === OrbitLunarAckStatus.ACCEPTED ||
      input.status === OrbitLunarAckStatus.EXECUTING)
  ) {
    await db.orbitCommand.update({
      where: { id: cmd.id },
      data: { outcome: "expired", detailJson: { note: "Ack after expiry window" } },
    });
    return { expired: true as const };
  }

  const outcomeMap: Record<string, string> = {
    [OrbitLunarAckStatus.REJECTED]: "rejected",
    [OrbitLunarAckStatus.EXECUTING]: "executing",
    [OrbitLunarAckStatus.COMPLETED]: "completed",
    [OrbitLunarAckStatus.FAILED]: "failed",
    [OrbitLunarAckStatus.ACCEPTED]: "accepted",
    [OrbitLunarAckStatus.RECEIVED]: "accepted",
  };
  const outcome = outcomeMap[input.status] ?? cmd.outcome;

  // sync_config: COMPLETED only counts when payload reports applied configVersion match
  if (
    cmd.command === OrbitLunarCommandName.SYNC_CONFIG &&
    input.status === OrbitLunarAckStatus.COMPLETED
  ) {
    const appliedVersion =
      typeof input.payload.appliedConfigVersion === "number"
        ? input.payload.appliedConfigVersion
        : typeof input.payload.configVersion === "number"
          ? input.payload.configVersion
          : null;
    const pending = await db.orbitDeviceConfig.findFirst({
      where: { deviceId: input.deviceId, status: "pending" },
      orderBy: { configVersion: "desc" },
    });
    if (pending && appliedVersion != null && appliedVersion === pending.configVersion) {
      await db.orbitDeviceConfig.update({
        where: { id: pending.id },
        data: { status: "applied", appliedAt: input.observedAt },
      });
      await db.orbitDevice.update({
        where: { id: input.deviceId },
        data: { appliedConfigVersion: appliedVersion },
      });
    } else if (pending && appliedVersion != null && appliedVersion !== pending.configVersion) {
      await db.orbitCommand.update({
        where: { id: cmd.id },
        data: {
          outcome: "failed",
          detailJson: {
            reason: "appliedConfigVersion mismatch",
            expected: pending.configVersion,
            applied: appliedVersion,
          },
        },
      });
      return { configMismatch: true as const };
    }
  }

  // CONFIG_UPDATED event path also marks apply — handled in ingest when event seen

  await db.orbitCommand.update({
    where: { id: cmd.id },
    data: {
      outcome,
      completedAt:
        outcome === "completed" || outcome === "failed" || outcome === "rejected"
          ? input.observedAt
          : cmd.completedAt,
      detailJson: {
        lastAckStatus: input.status,
        awaitBootCompletion: cmd.awaitBootCompletion,
        note:
          cmd.awaitBootCompletion && input.status === OrbitLunarAckStatus.COMPLETED
            ? "Restart completion correlated after boot via commandId"
            : undefined,
      },
    },
  });

  return { applied: true as const, outcome };
}

/**
 * Apply Lunar status without letting stale retained/LWT overwrite newer state.
 * LWT preconfigured timestamp is NOT the actual disconnect time.
 */
export async function applyLunarStatus(
  db: Db,
  input: {
    deviceId: string;
    tenantId: string;
    status: string;
    observedAt: Date;
    receivedAt: Date;
    messageId: string;
    isLikelyLwt?: boolean;
  }
) {
  const state = await db.orbitDeviceState.findUnique({ where: { deviceId: input.deviceId } });
  const priorAt = state?.lastHeartbeatAt;
  // If we already have a newer observation, ignore stale retained/LWT
  if (priorAt && priorAt.getTime() > input.observedAt.getTime()) {
    return {
      ignored: true as const,
      reason: "Stale status/retained/LWT older than current state — not applied",
    };
  }

  const online = input.status === "ONLINE" || input.status === "DEGRADED";
  const age = input.receivedAt.getTime() - input.observedAt.getTime();
  // Historical replay / very old retained must not mark online now
  const markOnlineNow = online && age <= 300_000;

  await db.orbitDeviceState.upsert({
    where: { deviceId: input.deviceId },
    create: {
      deviceId: input.deviceId,
      online: markOnlineNow,
      health: input.status.toLowerCase(),
      lastHeartbeatAt: input.observedAt,
      sensorHealth: "unknown",
      screenPower: "unknown",
      playbackVerified: "unknown",
      summaryJson: {
        lunarStatus: input.status,
        lastStatusMessageId: input.messageId,
        isLikelyLwt: Boolean(input.isLikelyLwt),
        note: input.isLikelyLwt
          ? "LWT timestamp is preconfigured — not actual disconnect time"
          : "Status change — connectivity only, not screen power or playback",
      },
    },
    update: {
      online: markOnlineNow ? true : input.status === "OFFLINE" ? false : state?.online ?? false,
      health: input.status.toLowerCase(),
      lastHeartbeatAt:
        !priorAt || priorAt <= input.observedAt ? input.observedAt : priorAt,
      summaryJson: {
        lunarStatus: input.status,
        lastStatusMessageId: input.messageId,
        isLikelyLwt: Boolean(input.isLikelyLwt),
        note: input.isLikelyLwt
          ? "LWT timestamp is preconfigured — not actual disconnect time"
          : "Status change — connectivity only, not screen power or playback",
      },
      updatedAt: new Date(),
    },
  });

  if (input.status === "OFFLINE" || input.status === "ERROR") {
    const open = await db.orbitIncident.findFirst({
      where: { deviceId: input.deviceId, kind: "connectivity", endedAt: null },
    });
    if (!open) {
      await db.orbitIncident.create({
        data: {
          deviceId: input.deviceId,
          tenantId: input.tenantId,
          kind: "connectivity",
          severity: input.status === "ERROR" ? "error" : "warning",
          startedAt: input.observedAt,
          evidenceJson: {
            source: "lunar_status",
            status: input.status,
            messageId: input.messageId,
            limitation: "Missing connectivity does not prove display lost power",
          },
        },
      });
    }
  }

  if (markOnlineNow) {
    const open = await db.orbitIncident.findFirst({
      where: { deviceId: input.deviceId, kind: "connectivity", endedAt: null },
    });
    if (open) {
      await db.orbitIncident.update({
        where: { id: open.id },
        data: { endedAt: input.observedAt },
      });
    }
  }

  return { applied: true as const, markOnlineNow };
}

export async function markConfigAppliedFromEvent(
  db: Db,
  input: { deviceId: string; configVersion: number; observedAt: Date }
) {
  const row = await db.orbitDeviceConfig.findUnique({
    where: {
      deviceId_configVersion: {
        deviceId: input.deviceId,
        configVersion: input.configVersion,
      },
    },
  });
  if (!row) return { missing: true as const };
  if (row.status === "applied") return { already: true as const };
  await db.orbitDeviceConfig.update({
    where: { id: row.id },
    data: { status: "applied", appliedAt: input.observedAt },
  });
  await db.orbitDevice.update({
    where: { id: input.deviceId },
    data: { appliedConfigVersion: input.configVersion },
  });
  return { applied: true as const };
}
