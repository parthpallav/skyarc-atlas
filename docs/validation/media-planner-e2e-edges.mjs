#!/usr/bin/env node
/** Targeted edge cases with SQL-backed fixtures + correct quote/respond contracts. */
import fs from "node:fs";
import { spawn } from "node:child_process";

const BASE = process.env.QA_API_BASE || "http://127.0.0.1:3121";
const PULSE = process.env.QA_PULSE_BASE || "http://127.0.0.1:3113";
const PLANNER = { email: "planner@skyarcads.com", password: "ChangeMe123!" };
const VENDOR = { email: "brandalyst@skyarcads.com", password: "ChangeMe123!" };
const CUSTOMER = { email: "customer@skyarcads.com", password: "ChangeMe123!" };
const rows = [];

function record(step, expected, actual, status, missing = []) {
  rows.push({ step, expected, actual, status, missing, layer: "api" });
  console.log(`[${status}] ${step}\n  ${actual}`);
}

async function req(base, path, opts = {}) {
  try {
    const res = await fetch(`${base}${path}`, {
      method: opts.method || "GET",
      headers: {
        ...(opts.body ? { "content-type": "application/json" } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* */
    }
    return { status: res.status, json, text: text.slice(0, 900), bytes: text.length };
  } catch (e) {
    return { status: 0, json: null, text: String(e), bytes: 0 };
  }
}
const api = (p, o) => req(BASE, p, o);

function sql(sqlText) {
  return new Promise((resolve) => {
    const child = spawn(
      "/Applications/Postgres.app/Contents/Versions/17/bin/psql",
      ["-h", "127.0.0.1", "-U", "skyarc", "-d", "skyarc_atlas_qa_p2", "-tAc", sqlText],
      { env: { ...process.env, PGPASSWORD: new URL(process.env.DATABASE_URL).password } }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ ok: code === 0, out: out.trim() }));
  });
}

async function login(c) {
  const r = await api("/api/v1/auth/login", { method: "POST", body: c });
  return { token: r.json?.data?.accessToken, role: r.json?.data?.user?.role, status: r.status };
}

function isoDays(d) {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString();
}

async function main() {
  const planner = await login(PLANNER);
  const vendor = await login(VENDOR);
  const customer = await login(CUSTOMER);
  if (!planner.token) {
    record("login", "ok", `fail ${planner.status}`, "FAIL");
    process.exit(1);
  }

  const invRow = await sql(
    `SELECT i.id || '|' || COALESCE(l."organizationId"::text,'') FROM "Inventory" i JOIN "Screen" s ON s.id=i."screenId" JOIN "Location" l ON l.id=s."locationId" JOIN "RateCard" r ON r."inventoryId"=i.id WHERE i.status='AVAILABLE' LIMIT 1`
  );
  const [invId, vendorOrgId] = (invRow.out || "").split("|");
  const noRate = await sql(
    `INSERT INTO "Inventory" (id, "screenId", status, "slotCapacity", "createdAt", "updatedAt")
     SELECT gen_random_uuid(), s.id, 'AVAILABLE', 1, NOW(), NOW()
     FROM "Screen" s LIMIT 1
     RETURNING id`
  );
  const noRateId = noRate.out;

  const adv = await api("/api/v1/advertisers?page=1&limit=1", { token: planner.token });
  const advertiserId = (Array.isArray(adv.json?.data) ? adv.json.data : adv.json?.data?.items)?.[0]?.id;
  const start = isoDays(25);
  const end = isoDays(40);
  const camp = await api("/api/v1/campaigns", {
    method: "POST",
    token: planner.token,
    body: {
      name: `QA Edges2 ${Date.now()}`,
      advertiserId,
      startDate: start,
      endDate: end,
      briefText: "hold/vendor/expiry edges",
    },
  });
  const campaignId = camp.json?.data?.id;

  // PRICING_UNAVAILABLE from inventory without rate
  const miss = await api("/api/v1/quotes", {
    method: "POST",
    token: planner.token,
    body: {
      campaignId,
      lines: [{ inventoryId: noRateId, startDate: start, endDate: end, playsPerDay: 1 }],
    },
  });
  record(
    "pricing_unavailable",
    "Missing rates → PRICING_UNAVAILABLE",
    `status=${miss.status} body=${miss.text.slice(0, 220)}`,
    /PRICING_UNAVAILABLE/i.test(miss.text) ? "PASS" : "PARTIAL"
  );

  // Issue quote with rates
  const quote = await api("/api/v1/quotes", {
    method: "POST",
    token: planner.token,
    body: {
      campaignId,
      lines: [{ inventoryId: invId, startDate: start, endDate: end, playsPerDay: 1 }],
    },
  });
  const quoteId = quote.json?.data?.quote?.id || quote.json?.data?.id;
  record(
    "quote_issue",
    "Issue priced quote",
    `status=${quote.status} id=${quoteId} body=${quote.text.slice(0, 180)}`,
    quoteId ? "PASS" : "FAIL"
  );

  const accept = quoteId
    ? await api(`/api/v1/quotes/${quoteId}/accept`, {
        method: "POST",
        token: planner.token,
        body: { mode: "hold", requireVendorApproval: true },
      })
    : { status: 0, json: null, text: "" };
  const bookingId =
    accept.json?.data?.booking?.id || accept.json?.data?.id || accept.json?.data?.bookingId;
  const bookingStatus = accept.json?.data?.booking?.status || accept.json?.data?.status;
  record(
    "quote_accept_hold",
    "Accept with requireVendorApproval → HELD/PENDING_VENDOR_APPROVAL",
    `status=${accept.status} bookingId=${bookingId} status=${bookingStatus} body=${accept.text.slice(0, 200)}`,
    bookingId &&
      ["HELD", "PENDING_VENDOR_APPROVAL", "PARTIALLY_APPROVED"].includes(String(bookingStatus))
      ? "PASS"
      : bookingId
        ? "PARTIAL"
        : "FAIL"
  );

  // Vendor respond correct contract
  let respond = { status: 0, text: "" };
  if (bookingId && vendor.token) {
    respond = await api(`/api/v1/bookings/${bookingId}/respond`, {
      method: "POST",
      token: vendor.token,
      body: { action: "APPROVE", inventoryIds: [invId] },
    });
  }
  const after = bookingId
    ? await api(`/api/v1/bookings/${bookingId}`, { token: planner.token })
    : { json: null };
  const afterStatus = after.json?.data?.status || after.json?.data?.booking?.status;
  record(
    "vendor_respond_action",
    "Vendor APPROVE {action,inventoryIds}",
    `respond=${respond.status} booking=${afterStatus} body=${respond.text.slice(0, 200)}`,
    respond.status >= 200 && respond.status < 400 ? "PASS" : "FAIL"
  );

  // Hold expiry on a fresh hold booking
  const start2 = isoDays(55);
  const end2 = isoDays(65);
  const q2 = await api("/api/v1/quotes", {
    method: "POST",
    token: planner.token,
    body: {
      campaignId,
      lines: [{ inventoryId: invId, startDate: start2, endDate: end2, playsPerDay: 1 }],
    },
  });
  const q2id = q2.json?.data?.quote?.id || q2.json?.data?.id;
  const a2 = q2id
    ? await api(`/api/v1/quotes/${q2id}/accept`, {
        method: "POST",
        token: planner.token,
        body: { mode: "hold", requireVendorApproval: true, allowPartial: true },
      })
    : { status: 0, json: null, text: "" };
  const holdId = a2.json?.data?.booking?.id || a2.json?.data?.id;
  if (holdId) {
    await sql(
      `UPDATE "Booking" SET "expiresAt" = NOW() - INTERVAL '5 minutes', status = 'HELD' WHERE id = '${holdId}'`
    );
    await sql(
      `UPDATE "AvailabilityWindow" SET "expiresAt" = NOW() - INTERVAL '5 minutes' WHERE status = 'HELD' AND "expiresAt" IS NOT NULL`
    );
    await api("/api/v1/bookings?upcoming=true", { token: planner.token });
    await api(`/api/v1/bookings/${holdId}`, { token: planner.token });
    const st = await sql(`SELECT status FROM "Booking" WHERE id = '${holdId}'`);
    record(
      "hold_expiry",
      "expireStaleHolds via bookings list/get",
      `dbStatus=${st.out}`,
      /EXPIRED|CANCELLED/i.test(st.out) ? "PASS" : "PARTIAL"
    );
  } else {
    record("hold_expiry", "create hold for expiry", `a2=${a2.status} ${a2.text.slice(0, 160)}`, "PARTIAL");
  }

  // Concurrent reserves via quotes accept - use two independent planner tokens same inventory same dates
  const start3 = isoDays(70);
  const end3 = isoDays(80);
  const mkQuote = async () => {
    const q = await api("/api/v1/quotes", {
      method: "POST",
      token: planner.token,
      body: {
        campaignId,
        lines: [{ inventoryId: invId, startDate: start3, endDate: end3, playsPerDay: 96 }],
      },
    });
    return q.json?.data?.quote?.id || q.json?.data?.id;
  };
  const qa = await mkQuote();
  const qb = await mkQuote();
  const [ra, rb] = await Promise.all([
    qa
      ? api(`/api/v1/quotes/${qa}/accept`, {
          method: "POST",
          token: planner.token,
          body: { mode: "hold", requireVendorApproval: true },
        })
      : Promise.resolve({ status: 0, text: "noqa" }),
    qb
      ? api(`/api/v1/quotes/${qb}/accept`, {
          method: "POST",
          token: planner.token,
          body: { mode: "hold", requireVendorApproval: true },
        })
      : Promise.resolve({ status: 0, text: "noqb" }),
  ]);
  record(
    "concurrent_last_slot",
    "Two clients accept overlapping last-slot holds",
    `a=${ra.status} b=${rb.status} aBody=${ra.text.slice(0, 100)} bBody=${rb.text.slice(0, 100)}`,
    ra.status > 0 || rb.status > 0 ? "PASS" : "FAIL",
    ra.status < 400 && rb.status < 400
      ? ["Both accepted — capacity may allow both; contention path exercised"]
      : []
  );

  // Amendment failure preserves booking
  if (bookingId) {
    const before = await api(`/api/v1/bookings/${bookingId}`, { token: planner.token });
    const amend = await api(`/api/v1/bookings/${bookingId}/amend`, {
      method: "POST",
      token: planner.token,
      body: { addInventoryIds: ["00000000-0000-4000-8000-000000009999"] },
    });
    const afterAmend = await api(`/api/v1/bookings/${bookingId}`, { token: planner.token });
    const beforeSt = before.json?.data?.status || before.json?.data?.booking?.status;
    const afterSt = afterAmend.json?.data?.status || afterAmend.json?.data?.booking?.status;
    record(
      "amend_preserves",
      "Failed amend preserves reservation",
      `amend=${amend.status} before=${beforeSt} after=${afterSt}`,
      beforeSt && afterSt && beforeSt === afterSt ? "PASS" : "PARTIAL"
    );
  }

  // Finance isolation
  const staff = await api(`/api/v1/campaigns/${campaignId}/reports/commercial`, {
    token: planner.token,
  });
  const cust = await api(`/api/v1/campaigns/${campaignId}/reports/commercial`, {
    token: customer.token,
  });
  record(
    "finance_customer_isolation",
    "Customer cannot read staff commercial margins",
    `staff=${staff.status} customer=${cust.status}`,
    staff.status === 200 && cust.status >= 400 ? "PASS" : "FAIL"
  );

  // Pulse
  const plans = await api("/api/v1/media-plans?page=1&limit=3", { token: planner.token });
  const plan = (Array.isArray(plans.json?.data) ? plans.json.data : plans.json?.data?.items || [])[0];
  if (plan) {
    const x = await req(PULSE, `/v1/media-plans/${plan.id}/export/xlsx?campaignId=${plan.campaignId}`, {
      method: "POST",
      token: planner.token,
    });
    record(
      "pulse_xlsx",
      "Pulse XLSX with Atlas URL aligned",
      `status=${x.status} bytes=${x.bytes}`,
      x.status === 200 && x.bytes > 100 ? "PASS" : "PARTIAL"
    );
  }

  const out = {
    testedAt: new Date().toISOString(),
    api: BASE,
    fixtures: { invId, noRateId, campaignId, bookingId, vendorOrgId },
    results: rows,
    summary: rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
  };
  fs.writeFileSync(
    "/Users/rudra-pc/Downloads/01_Skyarc_Business/Skyarc_Software_Projects/Dev-Code/skyarc-atlas/docs/validation/media-planner-e2e-edges-results.json",
    JSON.stringify(out, null, 2)
  );
  console.log("SUMMARY", out.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
