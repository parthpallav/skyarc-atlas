-- Multi-market geo fields on Location
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "state" TEXT;
CREATE INDEX IF NOT EXISTS "Location_city_idx" ON "Location"("city");
CREATE INDEX IF NOT EXISTS "Location_district_idx" ON "Location"("district");
CREATE INDEX IF NOT EXISTS "Location_state_idx" ON "Location"("state");
UPDATE "Location" SET city = 'Rajkot', district = 'Rajkot', state = 'Gujarat'
WHERE city IS NULL;
