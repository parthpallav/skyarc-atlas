/**
 * Import Rajkot hoarding inventory from prisma/data/rajkot-hoardings.json
 * Fetches reference images from Google Street View (or OSM static map fallback).
 *
 * Requires: DATABASE_URL, admin user from db:seed
 * Optional: GOOGLE_MAPS_API_KEY (Street View + satellite fallback)
 * Optional: R2_* for image upload (skips upload if unset)
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient, ScoreStatus, AssetKind, PhotoView } from "@prisma/client";

function slugifyLocationFolder(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function buildAssetKey(
  locationId: string,
  locationName: string,
  kind: string,
  ext = "jpg"
): string {
  const folder = slugifyLocationFolder(locationName);
  const ts = Date.now();
  return `locations/${folder}-${locationId.slice(0, 8)}/${kind.toLowerCase()}-${ts}.${ext}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

interface HoardingRow {
  iid: string;
  latitude: number;
  longitude: number;
  area: string;
  location: string;
  widthFt: number;
  heightFt: number;
  sqft: number;
  light: "BL" | "FL" | "NL";
}

const LIGHT_LABELS: Record<HoardingRow["light"], string> = {
  BL: "backlit",
  FL: "frontlit",
  NL: "non_lit",
};

const prisma = new PrismaClient();

function feetToMm(ft: number): number {
  return Math.round(ft * 304.8);
}

function estimateScore(sqft: number, lightingType?: string | null): number {
  let score = 58;
  if (sqft >= 400) score += 18;
  else if (sqft >= 300) score += 12;
  else if (sqft >= 200) score += 6;

  const light = (lightingType ?? "").toLowerCase();
  if (light.includes("back") || light === "bl") score += 10;
  if (light.includes("front") || light === "fl") score += 4;

  return Math.min(92, score);
}

async function hasStreetView(
  lat: number,
  lng: number,
  apiKey: string
): Promise<boolean> {
  const url =
    `https://maps.googleapis.com/maps/api/streetview/metadata` +
    `?location=${lat},${lng}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const data = (await res.json()) as { status?: string };
  return data.status === "OK";
}

async function fetchGoogleStreetView(
  lat: number,
  lng: number,
  apiKey: string
): Promise<Buffer | null> {
  const url =
    `https://maps.googleapis.com/maps/api/streetview` +
    `?size=1280x720&location=${lat},${lng}&fov=90&pitch=0&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 1000 ? buf : null;
}

async function fetchGoogleSatellite(
  lat: number,
  lng: number,
  apiKey: string
): Promise<Buffer | null> {
  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${lat},${lng}&zoom=18&size=800x600&maptype=satellite` +
    `&markers=color:red%7C${lat},${lng}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 1000 ? buf : null;
}

async function fetchEsriSatellite(lat: number, lng: number): Promise<Buffer | null> {
  const delta = 0.0015;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const url =
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=800,600&format=png&f=image`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SkyarcAtlas/1.0 (rajkot-seed)" },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 500 ? buf : null;
}

async function fetchOsmStaticMap(lat: number, lng: number): Promise<Buffer | null> {
  try {
    const url =
      `https://staticmap.openstreetmap.de/staticmap.php` +
      `?center=${lat},${lng}&zoom=17&size=800x600` +
      `&markers=${lat},${lng},red`;
    const res = await fetch(url, {
      headers: { "User-Agent": "SkyarcAtlas/1.0 (rajkot-seed)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 500 ? buf : null;
  } catch {
    return null;
  }
}

async function fetchReferenceImage(
  lat: number,
  lng: number,
  apiKey?: string
): Promise<{ buffer: Buffer; contentType: string; source: string } | null> {
  if (apiKey) {
    if (await hasStreetView(lat, lng, apiKey)) {
      const street = await fetchGoogleStreetView(lat, lng, apiKey);
      if (street) {
        return { buffer: street, contentType: "image/jpeg", source: "google_street_view" };
      }
    }
    const satellite = await fetchGoogleSatellite(lat, lng, apiKey);
    if (satellite) {
      return { buffer: satellite, contentType: "image/png", source: "google_satellite" };
    }
  }

  const osm = await fetchOsmStaticMap(lat, lng);
  if (osm) {
    return { buffer: osm, contentType: "image/png", source: "openstreetmap_static" };
  }

  const esri = await fetchEsriSatellite(lat, lng);
  if (esri) {
    return { buffer: esri, contentType: "image/png", source: "esri_world_imagery" };
  }
  return null;
}

function createR2Client() {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET ?? "skyarc-atlas";
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<boolean> {
  const r2 = createR2Client();
  if (!r2) return false;
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return true;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@skyarc.in";
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error(`Admin user not found (${adminEmail}). Run pnpm db:seed first.`);
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const scoringConfig = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
  const dataPath = join(__dirname, "data", "rajkot-hoardings.json");
  const rows = JSON.parse(readFileSync(dataPath, "utf-8")) as HoardingRow[];

  let created = 0;
  let skipped = 0;
  let images = 0;

  for (const row of rows) {
    const existing = await prisma.locationAttribute.findFirst({
      where: { key: "inventory_iid", valueJson: { equals: row.iid } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const locationId = randomUUID();
    const name = `${row.iid} — ${row.area}`;
    const mountingNotes = row.location;

    await prisma.location.create({
      data: {
        id: locationId,
        name,
        latitude: row.latitude,
        longitude: row.longitude,
        road: row.area,
        mountingNotes,
        surveyStatus: "SUBMITTED",
        capturedAt: new Date(),
        createdByUserId: admin.id,
        attributes: {
          create: [
            {
              key: "inventory_iid",
              valueJson: row.iid,
              provenance: "USER_PROVIDED",
              source: "rajkot_inventory_sheet",
            },
            {
              key: "lighting_type",
              valueJson: LIGHT_LABELS[row.light],
              provenance: "USER_PROVIDED",
              source: "rajkot_inventory_sheet",
            },
            {
              key: "sqft",
              valueJson: row.sqft,
              provenance: "USER_PROVIDED",
              source: "rajkot_inventory_sheet",
            },
          ],
        },
        screens: {
          create: {
            label: row.iid,
            inventoryStatus: "AVAILABLE",
            specification: {
              create: {
                widthMm: feetToMm(row.widthFt),
                heightMm: feetToMm(row.heightFt),
                aspectRatio: `${row.widthFt}:${row.heightFt}`,
              },
            },
          },
        },
        survey: {
          create: {
            checklist: { imported: true, source: "rajkot_hoardings_seed" },
            freeTextObservation: row.location,
            syncState: "UPLOADED",
          },
        },
      },
    });

    const screen = await prisma.screen.findFirst({ where: { locationId } });
    if (screen) {
      const monthlyRate = Math.max(15_000, Math.round(row.sqft * 80));
      const inventory = await prisma.inventory.create({
        data: {
          screenId: screen.id,
          productCode: row.iid,
          status: "AVAILABLE",
          notes: row.location,
        },
      });
      await prisma.rateCard.create({
        data: {
          inventoryId: inventory.id,
          currency: "INR",
          period: "monthly",
          amount: monthlyRate,
          effectiveFrom: new Date(),
          provenance: "ESTIMATED",
        },
      });
    }

    if (scoringConfig) {
      await prisma.locationScore.create({
        data: {
          locationId,
          scoringConfigId: scoringConfig.id,
          overallScore: estimateScore(row.sqft, LIGHT_LABELS[row.light]),
          overallConfidence: 0.65,
          status: ScoreStatus.COMPUTED,
          componentsJson: {
            source: "seed-rajkot-hoardings",
            sqft: row.sqft,
            lighting: LIGHT_LABELS[row.light],
          },
          computedAt: new Date(),
        },
      });
    }

    const image = await fetchReferenceImage(row.latitude, row.longitude, apiKey).catch(
      () => null
    );
    if (image) {
      const checksum = createHash("sha256").update(image.buffer).digest("hex");
      const locationFolder = slugifyLocationFolder(name, locationId);
      const r2Key = buildAssetKey({
        locationFolder,
        kind: AssetKind.PHOTO,
        view: PhotoView.FRONT,
        assetId: locationId,
        contentType: image.contentType,
      });
      const uploaded = await uploadToR2(image.buffer, r2Key, image.contentType);

      if (uploaded) {
        await prisma.locationAsset.create({
          data: {
            locationId,
            kind: "PHOTO",
            view: "FRONT",
            r2Key,
            contentType: image.contentType,
            byteSize: image.buffer.length,
            checksumSha256: checksum,
            width: 1280,
            height: 720,
            capturedAt: new Date(),
            capturedLat: row.latitude,
            capturedLng: row.longitude,
            uploadStatus: "UPLOADED",
            confirmedAt: new Date(),
          },
        });
        await prisma.locationAttribute.create({
          data: {
            locationId,
            key: "site_image_source",
            valueJson: image.source,
            provenance: "OBSERVED",
            source: image.source,
          },
        });
        images += 1;
      }
    }

    created += 1;
    console.log(`  + ${row.iid} @ ${row.latitude}, ${row.longitude}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(
    `\nRajkot import done: ${created} created, ${skipped} skipped, ${images} images uploaded` +
      (apiKey ? " (Google Maps enabled)" : " (OSM fallback — set GOOGLE_MAPS_API_KEY for Street View)")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
