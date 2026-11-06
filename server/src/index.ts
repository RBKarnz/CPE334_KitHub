import { ConfigError, loadConfig, loadEnvFile, type AppConfig } from "./core/config.js";

loadEnvFile();

let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    // Names the variables only, never their values (NFR-07).
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

// Imported after the configuration is valid, so Prisma reads a checked DATABASE_URL.
const { prisma } = await import("./core/prisma.js");
const { createApp } = await import("./app.js");

const app = createApp({ config, prisma });
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`KitHub API listening on 0.0.0.0:${config.port} (${config.nodeEnv})`);
});

// Cloud Run sends SIGTERM before stopping a container.
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
