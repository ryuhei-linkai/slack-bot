import { WebClient } from "@slack/web-api";
import { CachedMessage } from "@/types/config";
import { withRetry } from "@/lib/utils/rate-limit";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("slack-history");

/**
 * Fetch channel message history from Slack API with pagination and rate-limit retry.
 */
export async function fetchChannelHistory(
  client: WebClient,
  channelId: string,
  options: { oldest?: string; latest?: string; limit?: number } = {}
): Promise<CachedMessage[]> {
  const messages: CachedMessage[] = [];
  let cursor: string | undefined;
  const maxMessages = options.limit || 1000;

  do {
    const result = await withRetry(
      () =>
        client.conversations.history({
          channel: channelId,
          oldest: options.oldest,
          latest: options.latest,
          limit: 200,
          cursor,
        }),
      { label: "conversations.history", baseDelay: 2000 }
    );

    if (result.messages) {
      for (const msg of result.messages) {
        if (msg.subtype === "bot_message" && msg.bot_id) continue; // skip bot messages
        if (!msg.text && !msg.attachments?.length) continue;

        messages.push({
          ts: msg.ts!,
          user: msg.user || "unknown",
          text: msg.text || "",
          reactions: msg.reactions?.map((r) => ({
            name: r.name!,
            count: r.count!,
          })),
          threadTs: msg.thread_ts || null,
        });
      }
    }

    cursor = result.response_metadata?.next_cursor || undefined;

    if (messages.length >= maxMessages) {
      log.info(`Reached message limit (${maxMessages}), stopping fetch`);
      break;
    }
  } while (cursor);

  log.info(`Fetched ${messages.length} messages from channel ${channelId}`);
  return messages.reverse(); // chronological order
}

/**
 * Fetch channel members.
 */
export async function fetchChannelMembers(
  client: WebClient,
  channelId: string
): Promise<string[]> {
  const members: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await withRetry(
      () =>
        client.conversations.members({
          channel: channelId,
          limit: 200,
          cursor,
        }),
      { label: "conversations.members" }
    );

    if (result.members) {
      members.push(...result.members);
    }

    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return members;
}

/**
 * Get channel info.
 */
export async function fetchChannelInfo(
  client: WebClient,
  channelId: string
): Promise<{ name: string; topic: string; purpose: string }> {
  const result = await withRetry(
    () => client.conversations.info({ channel: channelId }),
    { label: "conversations.info" }
  );

  return {
    name: result.channel?.name || "unknown",
    topic: (result.channel as Record<string, unknown>)?.topic
      ? ((result.channel as Record<string, { value: string }>).topic).value
      : "",
    purpose: (result.channel as Record<string, unknown>)?.purpose
      ? ((result.channel as Record<string, { value: string }>).purpose).value
      : "",
  };
}
