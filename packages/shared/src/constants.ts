/**
 * Every tunable number in the system lives here (LLD §Constants, rules.md §4.1).
 * Units are always part of the name.
 */

// ---------- rooms ----------
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_MAX_ATTEMPTS = 5;
export const ROOM_CAPACITY = 100;
export const ROOM_NAME_MAX_LEN = 64;
export const DISPLAY_NAME_MAX_LEN = 32;
export const ID_MAX_LEN = 64;

// ---------- presence & lifecycle ----------
export const GRACE_PERIOD_MS = 15_000;
/** Delay past the grace period before the reap check runs, so the deadline has surely passed. */
export const GRACE_CHECK_SLACK_MS = 250;
export const RECOVERY_WINDOW_MS = 120_000;

// ---------- approval workflow ----------
export const REQUEST_TTL_MS = 60_000;
export const REQUEST_SWEEP_MS = 5_000;
export const MAX_PENDING_REQUESTS_PER_USER = 3;

// ---------- playback & sync ----------
export const MAX_MEDIA_SECONDS = 60 * 60 * 24;
export const SEEK_THRESHOLD_S = 1.0;
export const DRIFT_CHECK_MS = 2_000;
export const POST_SEEK_COOLDOWN_MS = 1_500;
export const AUTOPLAY_DETECT_MS = 1_500;
export const END_TOLERANCE_S = 3;
export const CLOCK_SYNC_INTERVAL_MS = 60_000;
export const CLOCK_SYNC_SAMPLES = 5;
export const CLOCK_SYNC_SAMPLE_DELAY_MS = 200;
export const CLOCK_SYNC_TIMEOUT_MS = 2_000;
/** How often the on-screen playback time refreshes. */
export const UI_TIME_REFRESH_MS = 250;
/** Arrow-key seek step. */
export const SEEK_STEP_S = 5;

// ---------- rate limits (LLD SP-17): token bucket per user per rule ----------
export const RATE_LIMITS = {
  playback: { points: 10, durationS: 5 },
  requests: { points: 3, durationS: 10 },
  moderation: { points: 20, durationS: 10 },
  chat: { points: 5, durationS: 5 },
  reaction: { points: 10, durationS: 5 },
  telemetry: { points: 30, durationS: 10 },
  join: { points: 10, durationS: 60 },
  createRoom: { points: 10, durationS: 3600 },
} as const;
export type RateRule = keyof typeof RATE_LIMITS;

// ---------- transport ----------
export const ACK_TIMEOUT_MS = 5_000;
export const MAX_HTTP_BUFFER_BYTES = 16 * 1024;

// ---------- persistence ----------
export const CAS_MAX_RETRIES = 3;
export const HOT_ROOM_TTL_S = 86_400;
export const SNAPSHOT_FLUSH_MS = 5_000;

// ---------- chat, reactions, queue ----------
export const CHAT_MAX_LEN = 500;
export const CHAT_HISTORY_LIMIT = 50;
/** Client keeps at most this many chat/system lines in memory. */
export const CHAT_RENDER_LIMIT = 200;
export const QUEUE_MAX = 50;
export const REACTION_SET = ['👍', '😂', '😮', '❤️', '🔥', '👏', '😢', '🎉'] as const;

// ---------- video ----------
export const VIDEO_URL_MAX_LEN = 500;
export const OEMBED_TIMEOUT_MS = 2_500;
export const OEMBED_CACHE_MAX = 1_000;
export const OEMBED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const OEMBED_NEGATIVE_TTL_MS = 10 * 60 * 1000;
export const VIDEO_FALLBACK_TITLE = 'YouTube video';

// ---------- persistence & auth ----------
export const DB_POOL_MAX = 10;
export const RECENT_ROOMS_LIMIT = 10;
export const AUTH_COOKIE_CACHE_S = 300;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// ---------- process ----------
export const SHUTDOWN_TIMEOUT_MS = 10_000;
