import { WebClient } from "@slack/web-api";
import { withRetry } from "@/lib/utils/rate-limit";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("slack-messages");

/**
 * Post a message to a Slack channel.
 */
export async function postMessage(
  client: WebClient,
  channelId: string,
  text: string,
  options: { threadTs?: string; unfurlLinks?: boolean } = {}
): Promise<string | undefined> {
  const result = await withRetry(
    () =>
      client.chat.postMessage({
        channel: channelId,
        text,
        thread_ts: options.threadTs,
        unfurl_links: options.unfurlLinks ?? false,
        mrkdwn: true,
      }),
    { label: "chat.postMessage" }
  );

  log.info(`Posted message to ${channelId}`, { ts: result.ts });
  return result.ts;
}

/**
 * Add a reaction (emoji) to a message.
 */
export async function addReaction(
  client: WebClient,
  channelId: string,
  timestamp: string,
  emoji: string
): Promise<void> {
  try {
    await withRetry(
      () =>
        client.reactions.add({
          channel: channelId,
          timestamp,
          name: emoji,
        }),
      { label: "reactions.add" }
    );
    log.info(`Added reaction :${emoji}: to message ${timestamp}`);
  } catch (error: unknown) {
    // "already_reacted" is not a real error
    if (error instanceof Error && error.message.includes("already_reacted")) {
      return;
    }
    throw error;
  }
}

/**
 * Get user display name.
 */
export async function getUserDisplayName(
  client: WebClient,
  userId: string
): Promise<string> {
  try {
    const result = await withRetry(
      () => client.users.info({ user: userId }),
      { label: "users.info" }
    );
    return (
      result.user?.profile?.display_name ||
      result.user?.real_name ||
      result.user?.name ||
      userId
    );
  } catch {
    return userId;
  }
}
