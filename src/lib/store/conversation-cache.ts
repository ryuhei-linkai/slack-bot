import { getRedis } from "./redis";
import { CachedMessage, SummaryRecord } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("conversation-cache");

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function cacheKey(channelId: string, date: string): string {
  return `conversation_cache:${channelId}:${date}`;
}

function summaryKey(channelId: string): string {
  return `summary_history:${channelId}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a message to today's cache for a channel.
 */
export async function appendMessage(channelId: string, message: CachedMessage): Promise<void> {
  const redis = getRedis();
  const key = cacheKey(channelId, todayDate());
  const existing = (await redis.get<CachedMessage[]>(key)) || [];
  existing.push(message);
  await redis.set(key, existing, { ex: CACHE_TTL_SECONDS });
}

/**
 * Get cached messages for a channel within a date range.
 */
export async function getCachedMessages(
  channelId: string,
  startDate: string,
  endDate: string
): Promise<CachedMessage[]> {
  const redis = getRedis();
  const messages: CachedMessage[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  const pipeline = redis.pipeline();
  const dateKeys: string[] = [];

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    dateKeys.push(dateStr);
    pipeline.get(cacheKey(channelId, dateStr));
    current.setDate(current.getDate() + 1);
  }

  const results = await pipeline.exec<(CachedMessage[] | null)[]>();
  for (const result of results) {
    if (result && Array.isArray(result)) {
      messages.push(...result);
    }
  }

  log.info(`Retrieved ${messages.length} cached messages for ${channelId}`, {
    startDate,
    endDate,
    daysQueried: dateKeys.length,
  });

  return messages;
}

/**
 * Bulk set messages for a specific date (used during initial history fetch).
 */
export async function setCachedMessages(
  channelId: string,
  date: string,
  messages: CachedMessage[]
): Promise<void> {
  const redis = getRedis();
  const key = cacheKey(channelId, date);
  await redis.set(key, messages, { ex: CACHE_TTL_SECONDS });
}

/**
 * Save a summary record for a channel.
 */
export async function saveSummaryRecord(channelId: string, record: SummaryRecord): Promise<void> {
  const redis = getRedis();
  const key = summaryKey(channelId);
  const existing = (await redis.get<SummaryRecord[]>(key)) || [];
  existing.push(record);
  // Keep last 50 summaries
  const trimmed = existing.slice(-50);
  await redis.set(key, trimmed);
}

/**
 * Get summary history for a channel.
 */
export async function getSummaryHistory(channelId: string): Promise<SummaryRecord[]> {
  const redis = getRedis();
  const key = summaryKey(channelId);
  return (await redis.get<SummaryRecord[]>(key)) || [];
}
