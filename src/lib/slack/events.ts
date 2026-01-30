import { WebClient } from "@slack/web-api";
import { getOrCreateChannelConfig } from "@/lib/store/channel-config";
import { appendMessage, getCachedMessages } from "@/lib/store/conversation-cache";
import { generateReply } from "@/lib/openai/discussion";
import { postMessage } from "@/lib/slack/messages";
import { CachedMessage } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("slack-events");

interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

/**
 * Handle incoming message events: cache the message.
 */
export async function handleMessageEvent(event: SlackMessageEvent): Promise<void> {
  // Ignore bot messages and message subtypes (edits, deletes, etc.)
  if (event.bot_id || event.subtype) return;
  if (!event.user || !event.text) return;

  const message: CachedMessage = {
    ts: event.ts,
    user: event.user,
    text: event.text,
    threadTs: event.thread_ts || null,
  };

  await appendMessage(event.channel, message);
  log.info(`Cached message from ${event.user} in ${event.channel}`);
}

/**
 * Handle app_mention events: reply to the user.
 */
export async function handleMentionEvent(
  event: SlackMessageEvent,
  client: WebClient
): Promise<void> {
  if (!event.user || !event.text) return;

  const channelId = event.channel;

  try {
    // Get or create channel config
    const config = await getOrCreateChannelConfig(channelId, channelId);

    if (!config.enabled) {
      log.info(`Bot disabled for channel ${channelId}, ignoring mention`);
      return;
    }

    // Strip the bot mention from the text
    const cleanText = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!cleanText) {
      await postMessage(
        client,
        channelId,
        "何かお手伝いできることはありますか？ :wave:\n\n使い方は `/discuss-config` で設定を確認できます。",
        { threadTs: event.thread_ts || event.ts }
      );
      return;
    }

    // Get recent context
    const today = new Date().toISOString().slice(0, 10);
    const recentMessages = await getCachedMessages(channelId, today, today);

    // Generate reply
    const reply = await generateReply(cleanText, config, recentMessages);
    await postMessage(client, channelId, reply, {
      threadTs: event.thread_ts || event.ts,
    });

    log.info(`Replied to mention from ${event.user} in ${channelId}`);
  } catch (error) {
    log.error(`Failed to handle mention`, { error: String(error), channelId });
    await postMessage(
      client,
      channelId,
      "すみません、エラーが発生しました :bow: しばらくしてからもう一度お試しください。",
      { threadTs: event.thread_ts || event.ts }
    );
  }
}
