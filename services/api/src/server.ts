import { loadEnv } from "@skyarc/config";
import { buildApp } from "./app.js";
import { connectDatabase, shutdownDatabase, startDatabaseKeepalive } from "./lib/prisma.js";

const env = loadEnv();

await connectDatabase();
startDatabaseKeepalive();

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await shutdownDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await shutdownDatabase();
  process.exit(1);
}
