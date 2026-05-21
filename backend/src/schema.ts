import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  vector,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type").notNull(),
  embedding: vector("embedding", { dimensions: 3072 }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// What we store per assistant turn so the UI can re-render the reasoning + any
// images the agent surfaced. Kept as JSONB so we don't proliferate columns.
export type MessageMeta = {
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    summary?: string;
  }>;
  matchedImages?: Array<{ id: string; filename: string; url: string }>;
  generatedImage?: {
    id: string;
    url: string;
    mimeType: string;
    prompt: string;
  };
};

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  meta: jsonb("meta").$type<MessageMeta>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  prompt: text("prompt").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type").notNull(),
  referenceIds: jsonb("reference_ids").$type<string[]>().default([]).notNull(),
  sessionId: uuid("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 3D drafts produced by Meshy from a 2D generation. One generation can have
// many models (re-runs / retries). `path` is null while the Meshy task is
// still pending/processing; populated once the .glb is downloaded to disk.
export type ModelStatus = "pending" | "processing" | "completed" | "failed";

export const models = pgTable("models", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  meshyTaskId: text("meshy_task_id").notNull(),
  path: text("path"),
  status: text("status").$type<ModelStatus>().notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

export type ImageRow = typeof images.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type GenerationRow = typeof generations.$inferSelect;
export type ModelRow = typeof models.$inferSelect;
