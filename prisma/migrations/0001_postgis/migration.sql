-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column and GIST index for Location
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS geom geography(Point, 4326);

-- Sync geom from lat/lng on insert/update via trigger
CREATE OR REPLACE FUNCTION sync_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_geom_sync ON "Location";
CREATE TRIGGER location_geom_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Location"
  FOR EACH ROW
  EXECUTE FUNCTION sync_location_geom();

-- Backfill existing rows
UPDATE "Location"
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE geom IS NULL;

CREATE INDEX IF NOT EXISTS location_geom_gist ON "Location" USING GIST (geom);
