import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './sockets/index.js';
import { startReminderScheduler } from './services/reminder.service.js';
import { User } from './models/index.js';

const SEED_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed/seed.js');

async function start() {
  await connectDB();

  // A fresh hosted database gets the demo accounts on first boot, so a
  // deployment needs no separate seeding step. Gated on there being no users
  // at all, so it can never touch a database that already holds real data.
  if (process.env.SEED_IF_EMPTY === 'true' && (await User.countDocuments()) === 0) {
    console.log('[server] Database is empty — loading demo data');
    const result = spawnSync(process.execPath, [SEED_SCRIPT], { stdio: 'inherit', env: process.env });
    if (result.status !== 0) console.error('[server] Demo data could not be loaded');
  }

  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);
  startReminderScheduler();

  server.listen(env.port, () => {
    console.log(`[server] Listening on http://localhost:${env.port} (${env.nodeEnv})`);
    console.log(`[server] Allowed origins: ${env.corsOrigins.join(', ')}`);
  });

  const shutdown = (signal) => () => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
