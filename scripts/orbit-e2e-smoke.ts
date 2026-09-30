/**
 * End-to-end Orbit smoke (requires Atlas API + Orbit Cloud + DB).
 *
 * Env:
 *   ATLAS_URL=http://127.0.0.1:3001
 *   ORBIT_URL=http://127.0.0.1:3002
 *   ATLAS_EMAIL / ATLAS_PASSWORD (admin)
 *   LOCATION_ID (optional — creates flow needs an existing location)
 */
const ATLAS = (process.env.ATLAS_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const ORBIT = (process.env.ORBIT_URL ?? "http://127.0.0.1:3002").replace(/\/$/, "");

async function json(res: Response) {
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const email = process.env.ATLAS_EMAIL ?? "admin@skyarc.in";
  const password = process.env.ATLAS_PASSWORD ?? "ChangeMe123!";
  const locationId = process.env.LOCATION_ID;
  if (!locationId) throw new Error("Set LOCATION_ID to an existing location UUID");

  const login = await json(
    await fetch(`${ATLAS}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
  const token = login.data.accessToken as string;
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const screenRes = await json(
    await fetch(`${ATLAS}/api/v1/locations/${locationId}/screens`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ label: `Orbit smoke ${Date.now()}`, inventoryStatus: "AVAILABLE" }),
    })
  );
  const screen = screenRes.data;
  console.log("screen", screen.id, screen.skyarcScreenCode);

  const attach = await json(
    await fetch(`${ATLAS}/api/v1/screens/${screen.id}/devices`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "orbit", deviceType: "orbit_edge" }),
    })
  );
  const claimCode = attach.data.provision.claimCode as string;
  const orbitDeviceId = attach.data.provision.orbitDeviceId as string;
  console.log("claimed", orbitDeviceId);

  const enroll = await json(
    await fetch(`${ORBIT}/provision/v1/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimCode }),
    })
  );
  const deviceSecret = enroll.deviceSecret as string;
  console.log("enrolled");

  await json(
    await fetch(`${ORBIT}/ingest/v1/heartbeat`, {
      method: "POST",
      headers: {
        "x-orbit-device-id": orbitDeviceId,
        "x-orbit-device-secret": deviceSecret,
      },
    })
  );
  console.log("heartbeat ok");

  // Allow outbox flush
  await new Promise((r) => setTimeout(r, 500));

  const status = await json(
    await fetch(`${ATLAS}/api/v1/screens/${screen.id}/orbit-status`, { headers: auth })
  );
  console.log("atlas status", JSON.stringify(status.data, null, 2));
  if (!status.data.attached || status.data.device?.status !== "online") {
    throw new Error("Expected Atlas device status online after heartbeat");
  }
  console.log("ORBIT E2E SMOKE PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
