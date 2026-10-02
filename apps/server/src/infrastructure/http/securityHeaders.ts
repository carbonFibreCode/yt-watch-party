import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Helmet with a CSP that allows exactly the YouTube origins the player needs (LLD SP-17).
 * HTTPS-only directives (HSTS, upgrade-insecure-requests) are enabled in production only, so
 * plain-http localhost development keeps working. For the same reason the http: player API is
 * allowed outside production: `youtube-player` loads `iframe_api` with the page's own scheme.
 */
export const securityHeaders = (production: boolean): RequestHandler =>
  helmet({
    strictTransportSecurity: production,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://s.ytimg.com',
          ...(production ? [] : ['http://www.youtube.com']),
        ],
        frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        imgSrc: ["'self'", 'https://i.ytimg.com', 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
