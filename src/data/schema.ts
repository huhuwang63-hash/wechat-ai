import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  openid: text('openid').unique().notNull(),
  unionid: text('unionid'),
  platform: text('platform').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  role: text('role').default('user').notNull(),
  quotaDaily: integer('quota_daily').default(100000).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title'),
  model: text('model').default('claude-sonnet-4-6').notNull(),
  systemPrompt: text('system_prompt'),
  totalTokens: integer('total_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').default(0).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const quotaLogs = pgTable('quota_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  action: text('action').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
