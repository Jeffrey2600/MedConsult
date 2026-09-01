import http from 'node:http';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './sockets/index.js';
import { startReminderScheduler } from './services/reminder.service.js';

async function start() {
  await connectDB();

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
