import type { RequestHandler } from 'express';
import helmet from 'helmet';

/** Helmet with a CSP that allows exactly the YouTube origins the player needs (LLD SP-17). */
export const securityHeaders = (): RequestHandler =>
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
        frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        imgSrc: ["'self'", 'https://i.ytimg.com', 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
