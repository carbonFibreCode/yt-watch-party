import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  CHAT_MAX_LEN,
  DISPLAY_NAME_MAX_LEN,
  ID_MAX_LEN,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LEN,
} from '@watchparty/shared';

/**
 * Postgres schema (LLD SP-6). The four auth tables mirror exactly what better-auth 1.7.7 reports
 * for our configuration (email/password + anonymous plugin); the auth integration tests fail if
 * they drift. Hot room state lives in the snapshot column; the database is never on the realtime path.
 */

const ROLE_LEN = 16;
const NANOID_LEN = 21;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- better-auth ----------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  isAnonymous: boolean('is_anonymous').default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------- watch party ----------

export const rooms = pgTable('rooms', {
  id: varchar('id', { length: ROOM_CODE_LENGTH }).primaryKey(),
  name: varchar('name', { length: ROOM_NAME_MAX_LEN }).notNull(),
  /** RoomSnapshot (validated by RoomSnapshotCodec on read). */
  snapshot: jsonb('snapshot').notNull(),
  /** Authoritative version for compare-and-set and monotonic snapshot flushes. */
  version: integer('version').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roomMemberships = pgTable(
  'room_memberships',
  {
    roomId: varchar('room_id', { length: ROOM_CODE_LENGTH })
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lastRole: varchar('last_role', { length: ROLE_LEN }).notNull(),
    lastJoinedAt: timestamp('last_joined_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index('room_memberships_user_recent_idx').on(t.userId, t.lastJoinedAt.desc()),
  ],
);

/** Author fields are denormalized: messages outlive guest accounts, which are deleted on sign-up. */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: varchar('id', { length: NANOID_LEN }).primaryKey(),
    roomId: varchar('room_id', { length: ROOM_CODE_LENGTH })
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: ID_MAX_LEN }).notNull(),
    userName: varchar('user_name', { length: DISPLAY_NAME_MAX_LEN }).notNull(),
    userRole: varchar('user_role', { length: ROLE_LEN }).notNull(),
    text: varchar('text', { length: CHAT_MAX_LEN }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_messages_room_recent_idx').on(t.roomId, t.createdAt.desc())],
);

export const authSchema = { user, session, account, verification };
export const schema = { ...authSchema, rooms, roomMemberships, chatMessages };
