import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';

import { env, isOriginAllowed } from './config/env.js';
import routes from './routes/index.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();

  // Render/Vercel sit behind a proxy; without this the rate limiter and
  // req.ip see the proxy address instead of the real client.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The frontend loads OpenStreetMap tiles, embeds Jitsi, and calls
      // Overpass/Agora directly; Helmet's default CSP blocks all of them.
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Strips $-prefixed and dotted keys so user input cannot smuggle
  // MongoDB query operators into a filter.
  app.use(mongoSanitize());

  if (!env.isProd) app.use(morgan('dev'));

  app.use('/api', globalLimiter, routes);

  // In production the built React app is served from this same origin, so
  // there is one URL, no CORS, and Socket.io connects back to where the
  // page came from. In development Vite serves the client instead.
  if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    app.use(
      '/assets',
      express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y' })
    );
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    // Every non-API path belongs to react-router.
    app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.json({
        success: true,
        name: 'MedConsult API',
        docs: '/api/health',
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
