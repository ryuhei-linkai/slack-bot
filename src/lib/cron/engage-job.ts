import { WebClient } from "@slack/web-api";
import { getAllChannelConfigs } from "@/lib/store/channel-config";
import { getCachedMessages } from "@/lib/store/conversation-cache";
import { fetchChannelMembers } from "@/lib/slack/history";
import { postMessage, addReaction } from "@/lib/slack/messages";
import { selectReaction, generateDeepDive, generateMentionMessage } from "@/lib/openai/discussion";
import { ChannelConfig, CachedMessage } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("engage-job");

// Frequency maps: probability of action per eligible message
const FREQUENCY_MAP: Record<string, number> = {
  low: 0.1,
  medium: 0.3,
  high: 0.6,
};

function shouldAct(frequency: string): boolean {
  return Math.random() < (FREQUENCY_MAP[frequency] || 0.3);
}

/**
 * Run the engagement job: react to messages, deep-dive, and mention members.
 */
export async function runEngageJob(): Promise<{ processed: number; errors: string[] }> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN!);
  const configs = await getAllChannelConfigs();
  const errors: string[] = [];
  let processed = 0;

  const botUserId = process.env.BOT_USER_ID;

  for (const config of configs) {
    if (!config.enabled || !config.engagement.enabled) continue;

    try {
      // Get recent messages (last 3 hours = today's cache is usually enough)
      const today = new Date().toISOString().slice(0, 10);
      const messages = await getCachedMessages(config.channelId, today, today);

      if (messages.length === 0) {
        log.info(`No recent messages for ${config.channelId}, skipping`);
        continue;
      }

      // Filter to recent messages (last 3 hours)
      const threeHoursAgo = Date.now() / 1000 - 3 * 60 * 60;
      const recentMessages = messages.filter((m) => parseFloat(m.ts) > threeHoursAgo);

      if (recentMessages.length === 0) continue;

      await processReactions(client, config, recentMessages, botUserId);
      await processDeepDives(client, config, recentMessages, messages);
      await processMentions(client, config, messages, botUserId);

      processed++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Failed engagement for ${config.channelId}`, { error: msg });
      errors.push(`${config.channelId}: ${msg}`);
    }
  }

  return { processed, errors };
}

async function processReactions(
  client: WebClient,
  config: ChannelConfig,
  recentMessages: CachedMessage[],
  botUserId?: string
): Promise<void> {
  for (const msg of recentMessages) {
    if (msg.user === botUserId) continue;
    if (!shouldAct(config.engagement.reactionFrequency)) continue;

    try {
      const emoji = await selectReaction(msg.text, config.model || "gpt-4.1");
      await addReaction(client, config.channelId, msg.ts, emoji);
    } catch (error) {
      log.warn(`Failed to add reaction`, { ts: msg.ts, error: String(error) });
    }
  }
}

async function processDeepDives(
  client: WebClient,
  config: ChannelConfig,
  recentMessages: CachedMessage[],
  allMessages: CachedMessage[]
): Promise<void> {
  // Pick at most 1 message to deep-dive per run
  const candidates = recentMessages.filter(
    (m) => m.text.length > 30 && !m.threadTs
  );

  if (candidates.length === 0) return;
  if (!shouldAct(config.engagement.deepDiveFrequency)) return;

  const target = candidates[Math.floor(Math.random() * candidates.length)];

  try {
    const deepDive = await generateDeepDive(target.text, config, allMessages);
    await postMessage(client, config.channelId, deepDive, { threadTs: target.ts });
    log.info(`Deep dive posted for message ${target.ts}`);
  } catch (error) {
    log.warn(`Failed to deep-dive`, { ts: target.ts, error: String(error) });
  }
}

async function processMentions(
  client: WebClient,
  config: ChannelConfig,
  allMessages: CachedMessage[],
  botUserId?: string
): Promise<void> {
  if (!shouldAct(config.engagement.mentionFrequency)) return;

  try {
    const members = await fetchChannelMembers(client, config.channelId);
    const humanMembers = members.filter((m) => m !== botUserId);

    if (humanMembers.length === 0) return;

    const targetUser = humanMembers[Math.floor(Math.random() * humanMembers.length)];
    const mentionMsg = await generateMentionMessage(targetUser, allMessages, config);
    await postMessage(client, config.channelId, mentionMsg);
    log.info(`Mention posted for user ${targetUser}`);
  } catch (error) {
    log.warn(`Failed to mention`, { error: String(error) });
  }
}
