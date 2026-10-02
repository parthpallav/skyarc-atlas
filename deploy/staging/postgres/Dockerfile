# Staging Postgres — PostGIS only (single DB skyarc_atlas_staging for Atlas/Orbit/Pulse/Bridge).
# Do not create a separate skyarc_orbit DB here; staging URLs share one database name.
FROM postgis/postgis:17-3.5
COPY 01-postgis.sql /docker-entrypoint-initdb.d/01-postgis.sql
