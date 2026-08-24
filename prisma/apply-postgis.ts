import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
  },
});

const statements = [
  `CREATE EXTENSION IF NOT EXISTS postgis`,
  `ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)`,
  `CREATE OR REPLACE FUNCTION sync_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS location_geom_sync ON "Location"`,
  `CREATE TRIGGER location_geom_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Location"
  FOR EACH ROW
  EXECUTE FUNCTION sync_location_geom()`,
  `UPDATE "Location"
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE geom IS NULL`,
  `CREATE INDEX IF NOT EXISTS location_geom_gist ON "Location" USING GIST (geom)`,
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log("PostGIS extension and location geom applied");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
