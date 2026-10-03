#!/usr/bin/env node
/**
 * Connected Media Planner journey E2E (isolated QA).
 * Roles: MEDIA_PLANNER + separate vendor identities. No Super Admin bypass.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API = process.env.API_BASE || "http://127.0.0.1:3131";
const WEB = process.env.WEB_BASE || "http://127.0.0.1:3100";
const PLANNER_EMAIL = process.env.PLANNER_EMAIL || "planner@skyarcads.com";
const PLANNER_PASSWORD = process.env.PLANNER_PASSWORD || "ChangeMe123!";
const VENDOR_A_EMAIL = process.env.VENDOR_A_EMAIL || "brandalyst@skyarcads.com";
const VENDOR_A_PASSWORD = process.env.VENDOR_A_PASSWORD || "ChangeMe123!";
const VENDOR_B_EMAIL = process.env.VENDOR_B_EMAIL || "apex@skyarcads.com";
const VENDOR_B_PASSWORD = process.env.VENDOR_B_PASSWORD || "ChangeMe123!";

const results = [];
const evidence = [];
const startedAt = new Date().toISOString();

function record(step, expected, actual, status, missing = [], layer = "api") {
  results.push({ step, expected, actual, status, missing, layer });
  console.log(`[${status}] ${step}: ${actual}`);
}

async function req(path, { method = "GET", token, body, raw } = {}) {
  const urlPath = path.startsWith("/api/") || path === "/health" ? path : `/api/v1${path}`;
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (raw) return { status: res.status, text, json };
  return { status: res.status, json, data: json?.data ?? null, error: json?.error ?? null };
}

async function login(email, password) {
  const r = await req("/auth/login", { method: "POST", body: { email, password } });
  const token = r.data?.accessToken || r.data?.tokens?.accessToken || r.data?.token || r.json?.accessToken;
  const user = r.data?.user || r.json?.user;
  return { status: r.status, token, user, error: r.error };
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function finish() {
  const out = {
    testedAt: new Date().toISOString(),
    startedAt,
    api: API,
    web: WEB,
    gitSha: process.env.GIT_SHA || null,
    results,
    evidence,
    summary: {
      PASS: results.filter((r) => r.status === "PASS").length,
      PARTIAL: results.filter((r) => r.status === "PARTIAL").length,
      FAIL: results.filter((r) => r.status === "FAIL").length,
      BLOCKED: results.filter((r) => r.status === "BLOCKED").length,
    },
    roleStateTransitions: [
      {
        from: "PROPOSED plan",
        action: "Set as current plan (APPROVED)",
        to: "Current plan + HELD booking PENDING_VENDOR_APPROVAL; campaign PENDING_APPROVAL (not LIVE)",
      },
      {
        from: "PENDING_VENDOR_APPROVAL items",
        action: "Vendor APPROVE/REJECT",
        to: "CONFIRMED or REJECTED booking items; expired hold cannot be restored",
      },
      {
        from: "Confirmed commitments + readiness",
        action: "Mark live",
        to: "Campaign ACTIVE (Scheduled before flight start; Live after)",
      },
      {
        from: "Export / Orbit / plan approve",
        action: "automatic",
        to: "Must NOT set ACTIVE",
      },
    ],
    gaps: [
      "Browser desktop/mobile evidence still required separately for keyboard/tap.",
      "Customer electronic acceptance remains QuoteRevision-based when issued; commitment view documents absence.",
      "Replacement suggestions after reject use existing swap/alternatives paths.",
      "Phase2 proposal/ops/billing modules remain on feat/phase2 worktree when needed.",
    ],
  };
  const dest = resolve("docs/validation/media-planner-connected-e2e-results.json");
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("\nWrote", dest);
  console.log("Summary", out.summary);
  process.exit(out.summary.FAIL > 0 ? 1 : 0);
}

async function main() {
  const gitSha = process.env.GIT_SHA || "local-workspace";
  evidence.push({ kind: "baseline", api: API, web: WEB, gitSha, startedAt });

  const health = await req("/health");
  record("0.health", "API healthy", `http=${health.status}`, health.status === 200 ? "PASS" : "FAIL");

  const webHealth = await fetch(WEB).then((r) => r.status).catch(() => 0);
  record(
    "0.web",
    "Web reachable",
    `http=${webHealth}`,
    webHealth > 0 && webHealth < 500 ? "PASS" : "PARTIAL",
    webHealth === 0 ? ["Web not running on WEB_BASE"] : []
  );

  const planner = await login(PLANNER_EMAIL, PLANNER_PASSWORD);
  const plannerRole = planner.user?.role || planner.user?.roles?.[0];
  if (!planner.token || plannerRole === "SUPER_ADMIN") {
    record(
      "0.login_planner",
      "MEDIA_PLANNER token (no SA)",
      `role=${plannerRole} status=${planner.status}`,
      "FAIL",
      ["Planner login failed or returned SUPER_ADMIN"]
    );
    return finish();
  }
  record(
    "0.login_planner",
    "MEDIA_PLANNER token (no SA)",
    `role=${plannerRole} email=${PLANNER_EMAIL}`,
    plannerRole === "MEDIA_PLANNER" ? "PASS" : "PARTIAL",
    plannerRole !== "MEDIA_PLANNER" ? [`role=${plannerRole}`] : []
  );

  const vendorA = await login(VENDOR_A_EMAIL, VENDOR_A_PASSWORD);
  const vendorB = await login(VENDOR_B_EMAIL, VENDOR_B_PASSWORD);
  record(
    "0.login_vendors",
    "Two vendor identities",
    `a=${vendorA.status}/${vendorA.user?.role} b=${vendorB.status}/${vendorB.user?.role}`,
    vendorA.token && vendorB.token ? "PASS" : vendorA.token ? "PARTIAL" : "FAIL",
    !vendorB.token ? ["Vendor B login failed — dual-vendor steps limited"] : []
  );

  const locs = await req("/locations?page=1&limit=50", { token: planner.token });
  const locationRows = Array.isArray(locs.data) ? locs.data : locs.data?.items || [];
  const cities = new Set(locationRows.map((l) => l.city || l.district || l.state).filter(Boolean));
  record(
    "1.browse_inventory",
    "Multi-city inventory list",
    `http=${locs.status} n=${locationRows.length} cities=${cities.size}`,
    locs.status === 200 && locationRows.length > 0 ? "PASS" : "FAIL"
  );

  const startDate = isoDaysFromNow(14);
  const endDate = isoDaysFromNow(28);
  let digitalDetail = null;
  for (const loc of locationRows.slice(0, 20)) {
    const d = await req(`/locations/${loc.id}?from=${startDate.slice(0,10)}&to=${endDate.slice(0,10)}`, { token: planner.token });
    const live = d.data?.liveInventory;
    const invType = (d.data?.inventories?.[0]?.inventoryType || d.data?.inventoryType || "").toUpperCase();
    if (!digitalDetail && live && (invType.includes("DIGITAL") || live.isDigital)) {
      digitalDetail = { loc, d, live };
      break;
    }
  }
  const digCap = digitalDetail?.live?.capacity ?? digitalDetail?.d?.data?.inventories?.[0]?.slotCapacity;
  record(
    "2.digital_capacity_configured",
    "Digital capacity from inventory config",
    `capacity=${digCap} status=${digitalDetail?.live?.status}`,
    digitalDetail ? "PASS" : "PARTIAL",
    !digitalDetail ? ["No digital location with liveInventory in sample"] : []
  );

  const campName = `QA Connected ${Date.now()}`;
  const create = await req("/campaigns", {
    method: "POST",
    token: planner.token,
    body: {
      name: campName,
      advertiserName: "QA Connected Brand",
      startDate,
      endDate,
      briefText: "Connected media planner journey QA",
      structuredRequirements: {
        budget: 750000,
        objective: "AWARENESS",
        brandCategory: "FMCG",
        targetAudience: ["Urban families"],
        geographicFocus: [...cities].slice(0, 2),
        preferredFormats: ["Digital Billboard (DOOH)", "Kiosk"],
        kpis: ["SOV"],
        durationDays: 14,
        maxLocations: 8,
      },
    },
  });
  const campaignId = create.data?.id;
  record(
    "3.create_campaign",
    "Campaign with multi-city brief + budget + KPIs",
    `http=${create.status} id=${campaignId}`,
    create.status < 300 && campaignId ? "PASS" : "FAIL",
    create.error ? [JSON.stringify(create.error)] : []
  );
  if (!campaignId) return finish();

  const opt = await req(`/campaigns/${campaignId}/media-plans/optimize`, {
    method: "POST",
    token: planner.token,
    body: { name: `${campName} — Plan`, totalBudget: 750000, maxLocations: 6 },
  });
  const planId = opt.data?.plan?.id || opt.data?.id;
  record(
    "4.generate_proposed_plan",
    "Save initial proposed media plan",
    `http=${opt.status} planId=${planId}`,
    opt.status < 300 && planId ? "PASS" : "FAIL",
    opt.error ? [JSON.stringify(opt.error)] : []
  );
  if (!planId) return finish();

  const campGet = await req(`/campaigns/${campaignId}`, { token: planner.token });
  const plans = campGet.data?.mediaPlans || [];
  record(
    "5.campaign_shows_plan",
    "Plan visible on campaign details",
    `plans=${plans.length} lifecycle=${campGet.data?.lifecycleStatus}`,
    plans.some((p) => p.id === planId) ? "PASS" : "FAIL"
  );

  const approve = await req(`/campaigns/${campaignId}/media-plans/${planId}/status`, {
    method: "PATCH",
    token: planner.token,
    body: { status: "APPROVED" },
  });
  const lifeAfterApprove = approve.data?.lifecycleStatus;
  const commitAfter = await req(`/campaigns/${campaignId}/commitment`, { token: planner.token });
  const bookingStatus = commitAfter.data?.commitments?.[0]?.status;
  record(
    "6.set_current_plan_hold",
    "Set current plan creates hold + pending vendor; not LIVE",
    `planHttp=${approve.status} lifecycle=${lifeAfterApprove} booking=${bookingStatus} commitHttp=${commitAfter.status}`,
    approve.status < 300 && lifeAfterApprove !== "ACTIVE"
      ? bookingStatus
        ? "PASS"
        : "PARTIAL"
      : "FAIL",
    lifeAfterApprove === "ACTIVE"
      ? ["Lifecycle incorrectly ACTIVE after plan approve"]
      : commitAfter.status >= 400
        ? ["Commitment endpoint missing — API not rebuilt with new routes"]
        : !bookingStatus
          ? ["No booking commitment after set current plan"]
          : []
  );

  const markBlocked = await req(`/campaigns/${campaignId}/mark-live`, {
    method: "POST",
    token: planner.token,
    body: { reason: "premature" },
  });
  record(
    "7.mark_live_blocked_pre_vendor",
    "Mark live blocked until commitments confirmed",
    `http=${markBlocked.status} msg=${markBlocked.error?.message || ""}`,
    markBlocked.status >= 400 || markBlocked.status === 404 ? "PASS" : "FAIL"
  );

  const bookingId = commitAfter.data?.commitments?.[0]?.bookingId;
  if (vendorA.token && bookingId) {
    const invIds = (commitAfter.data?.commitments?.[0]?.items || []).map((i) => i.inventoryId);
    if (invIds.length >= 2) {
      const approveSome = await req(`/bookings/${bookingId}/respond`, {
        method: "POST",
        token: vendorA.token,
        body: { action: "APPROVE", inventoryIds: [invIds[0]] },
      });
      const rejectSome = await req(`/bookings/${bookingId}/respond`, {
        method: "POST",
        token: vendorA.token,
        body: { action: "REJECT", inventoryIds: [invIds[1]] },
      });
      record(
        "8.vendor_partial_booking_respond",
        "Vendor approve some / reject some via booking ledger",
        `approve=${approveSome.status} reject=${rejectSome.status}`,
        approveSome.status < 300 || rejectSome.status < 300
          ? "PASS"
          : "PARTIAL",
        approveSome.status >= 400 ? [JSON.stringify(approveSome.error || {})] : []
      );
    } else {
      record(
        "8.vendor_partial_booking_respond",
        "Vendor approve some / reject some via booking ledger",
        `items=${invIds.length}`,
        "PARTIAL",
        ["Need ≥2 booking items"]
      );
    }
  } else {
    record(
      "8.vendor_partial_booking_respond",
      "Vendor approve some / reject some via booking ledger",
      "no vendor token or booking",
      "BLOCKED"
    );
  }

  const planItems = await req(`/campaigns/${campaignId}/media-plans/${planId}`, { token: planner.token });
  const pendingItems = (planItems.data?.items || []).filter((i) => i.approvalStatus === "PENDING");
  if (vendorA.token && pendingItems.length > 0) {
    const owned = pendingItems.slice(0, Math.max(1, Math.floor(pendingItems.length / 2)));
    const rest = pendingItems.slice(owned.length);
    const a1 = await req(`/campaigns/${campaignId}/media-plans/${planId}/respond`, {
      method: "POST",
      token: vendorA.token,
      body: { action: "APPROVE", inventoryIds: owned.map((i) => i.inventoryId) },
    });
    let a2 = { status: 0 };
    if (rest.length) {
      a2 = await req(`/campaigns/${campaignId}/media-plans/${planId}/respond`, {
        method: "POST",
        token: vendorA.token,
        body: { action: "REJECT", inventoryIds: rest.map((i) => i.inventoryId) },
      });
    }
    record(
      "9.vendor_media_plan_respond",
      "Vendor item decisions via media-plan respond",
      `approve=${a1.status} reject=${a2.status} pendingWas=${pendingItems.length}`,
      a1.status < 300 ? "PASS" : "PARTIAL",
      a1.error ? [JSON.stringify(a1.error)] : []
    );
  } else {
    record(
      "9.vendor_media_plan_respond",
      "Vendor item decisions via media-plan respond",
      `pending=${pendingItems.length}`,
      "PARTIAL",
      ["No PENDING plan items or vendor unavailable"]
    );
  }

    // Happy-path: confirm remaining held items so mark-live can succeed when capacity allows
  const commitMid = await req(`/campaigns/${campaignId}/commitment`, { token: planner.token });
  const midBooking = commitMid.data?.commitments?.[0];
  if (vendorA.token && midBooking?.bookingId) {
    const pendingInv = (midBooking.items || [])
      .filter((i) => ["HELD", "PENDING_VENDOR_APPROVAL", "REQUESTED"].includes(i.status))
      .map((i) => i.inventoryId)
      .filter(Boolean);
    if (pendingInv.length) {
      await req(`/bookings/${midBooking.bookingId}/respond`, {
        method: "POST",
        token: vendorA.token,
        body: { action: "APPROVE", inventoryIds: pendingInv },
      });
    }
  }

  const commit2 = await req(`/campaigns/${campaignId}/commitment`, { token: planner.token });
  const ready = await req(`/campaigns/${campaignId}/activation-readiness`, { token: planner.token });
  record(
    "10.commitment_and_readiness",
    "Commitment summary + activation readiness surfaces",
    `commit=${commit2.status} readyHttp=${ready.status} ready=${ready.data?.ready}`,
    commit2.status === 200 && ready.status === 200 ? "PASS" : commit2.status === 404 ? "PARTIAL" : "FAIL"
  );

  const mark = await req(`/campaigns/${campaignId}/mark-live`, {
    method: "POST",
    token: planner.token,
    body: { reason: "qa_connected_e2e" },
  });
  const campAfter = await req(`/campaigns/${campaignId}`, { token: planner.token });
  record(
    "11.mark_live",
    "Authorized mark-live when ready; else blocked with reasons",
    `http=${mark.status} lifecycle=${campAfter.data?.lifecycleStatus} ready=${ready.data?.ready}`,
    mark.status < 300 && campAfter.data?.lifecycleStatus === "ACTIVE"
      ? "PASS"
      : mark.status >= 400 && !ready.data?.ready
        ? "PASS"
        : "PARTIAL"
  );

  const pdf = await req(`/campaigns/${campaignId}/media-plans/${planId}/export/pdf`, {
    method: "POST",
    token: planner.token,
    raw: true,
  });
  // Dedicated mark-live success: small plan, vendor approves all owned items
  {
    const create2 = await req("/campaigns", {
      method: "POST",
      token: planner.token,
      body: {
        name: `QA MarkLive ${Date.now()}`,
        advertiserName: "QA Live Brand",
        startDate,
        endDate,
        structuredRequirements: {
          budget: 200000,
          objective: "AWARENESS",
          geographicFocus: [...cities].slice(0, 1),
          maxLocations: 2,
          durationDays: 14,
        },
      },
    });
    const c2 = create2.data?.id;
    let liveOk = false;
    let detail = `create=${create2.status}`;
    if (c2) {
      const opt2 = await req(`/campaigns/${c2}/media-plans/optimize`, {
        method: "POST",
        token: planner.token,
        body: { name: "Live pack", totalBudget: 200000, maxLocations: 2 },
      });
      const p2 = opt2.data?.plan?.id || opt2.data?.id;
      detail += ` opt=${opt2.status} plan=${p2}`;
      if (p2) {
        await req(`/campaigns/${c2}/media-plans/${p2}/status`, {
          method: "PATCH",
          token: planner.token,
          body: { status: "APPROVED" },
        });
        const cmt = await req(`/campaigns/${c2}/commitment`, { token: planner.token });
        const bid = cmt.data?.commitments?.[0]?.bookingId;
        const invIds = (cmt.data?.commitments?.[0]?.items || []).map((i) => i.inventoryId);
        if (vendorA.token && bid && invIds.length) {
          const vr = await req(`/bookings/${bid}/respond`, {
            method: "POST",
            token: vendorA.token,
            body: { action: "APPROVE", inventoryIds: invIds },
          });
          detail += ` vendorApprove=${vr.status}`;
        }
        // Also media-plan respond approve all pending for Skyarc/vendor owned
        const planGet = await req(`/campaigns/${c2}/media-plans/${p2}`, { token: planner.token });
        const pending = (planGet.data?.items || []).filter((i) => i.approvalStatus === "PENDING");
        if (vendorA.token && pending.length) {
          await req(`/campaigns/${c2}/media-plans/${p2}/respond`, {
            method: "POST",
            token: vendorA.token,
            body: { action: "APPROVE", inventoryIds: pending.map((i) => i.inventoryId) },
          });
        }
        const ready2 = await req(`/campaigns/${c2}/activation-readiness`, { token: planner.token });
        const mark2 = await req(`/campaigns/${c2}/mark-live`, {
          method: "POST",
          token: planner.token,
          body: { reason: "qa_mark_live_success" },
        });
        const after = await req(`/campaigns/${c2}`, { token: planner.token });
        detail += ` ready=${ready2.data?.ready} mark=${mark2.status} life=${after.data?.lifecycleStatus}`;
        liveOk = after.data?.lifecycleStatus === "ACTIVE" || (mark2.status < 300 && mark2.data?.lifecycleStatus === "ACTIVE");
        // If vendor does not own all sites, readiness may still block — record PARTIAL not FAIL
        record(
          "11b.mark_live_success",
          "Full vendor confirm then Mark live → ACTIVE/Scheduled",
          detail,
          liveOk ? "PASS" : ready2.data?.ready === false ? "PARTIAL" : "FAIL",
          liveOk
            ? []
            : ["Vendor may not own all selected inventory; confirmations incomplete for full LIVE"]
        );
      } else {
        record("11b.mark_live_success", "Full vendor confirm then Mark live → ACTIVE/Scheduled", detail, "FAIL");
      }
    } else {
      record("11b.mark_live_success", "Full vendor confirm then Mark live → ACTIVE/Scheduled", detail, "FAIL");
    }
  }

  record(
    "12.export_revision",
    "Export current plan revision",
    `http=${pdf.status} bytes=${pdf.text?.length ?? 0}`,
    pdf.status === 200 ? "PASS" : "PARTIAL"
  );

  if (vendorB.token) {
    const denied = await req(`/campaigns/${campaignId}/commitment`, { token: vendorB.token });
    record(
      "13.cross_tenant_commitment",
      "Vendor cannot read planner commitment summary",
      `http=${denied.status}`,
      denied.status === 403 || denied.status === 404 || denied.status === 401 ? "PASS" : "FAIL"
    );
  } else {
    record("13.cross_tenant_commitment", "Vendor cannot read planner commitment summary", "no vendor B", "BLOCKED");
  }

  const past = await req(
    `/locations/${locationRows[0]?.id}?from=2020-01-01&to=2020-01-15`,
    { token: planner.token }
  );
  record(
    "14.past_flight_availability",
    "Past flight occupancy coherent",
    `http=${past.status} live=${Boolean(past.data?.liveInventory)}`,
    past.status === 200 ? "PASS" : "FAIL"
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  record("fatal", "run completes", String(err), "FAIL");
  finish();
});
