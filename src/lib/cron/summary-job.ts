import { WebClient } from "@slack/web-api";
import { getAllChannelConfigs } from "@/lib/store/channel-config";
import { getCachedMessages, saveSummaryRecord } from "@/lib/store/conversation-cache";
import { generateSummary } from "@/lib/openai/summary";
import { postMessage } from "@/lib/slack/messages";
import { fetchChannelHistory } from "@/lib/slack/history";
import { setCachedMessages } from "@/lib/store/conversation-cache";
import { CachedMessage } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("summary-job");

/**
 * Run the summary job for all configured channels.
 */
export async function runSummaryJob(): Promise<{ processed: number; errors: string[] }> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN!);
  const configs = await getAllChannelConfigs();
  const errors: string[] = [];
  let processed = 0;

  for (const config of configs) {
    if (!config.enabled || !config.summary.enabled) continue;

    try {
      // Determine the period based on schedule
      const now = new Date();
      let startDate: string;
      const endDate = now.toISOString().slice(0, 10);

      if (config.summary.schedule === "daily") {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = yesterday.toISOString().slice(0, 10);
      } else if (config.summary.schedule === "weekly") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().slice(0, 10);
      } else {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().slice(0, 10);
      }

      // Try cache first, then fall back to API
      let messages = await getCachedMessages(config.channelId, startDate, endDate);

      if (messages.length === 0) {
        log.info(`Cache empty for ${config.channelId}, fetching from Slack API`);
        const oldest = (new Date(startDate).getTime() / 1000).toString();
        const latest = (new Date(endDate).getTime() / 1000 + 86400).toString();

        const fetched = await fetchChannelHistory(client, config.channelId, { oldest, latest });

        // Cache the fetched messages by date
        const messagesByDate = new Map<string, CachedMessage[]>();
        for (const msg of fetched) {
          const date = new Date(parseFloat(msg.ts) * 1000).toISOString().slice(0, 10);
          const existing = messagesByDate.get(date) || [];
          existing.push(msg);
          messagesByDate.set(date, existing);
        }
        for (const [date, msgs] of messagesByDate) {
          await setCachedMessages(config.channelId, date, msgs);
        }

        messages = fetched;
      }

      const period = `${startDate} 〜 ${endDate}`;
      const summary = await generateSummary(messages, config, period);

      await postMessage(client, config.channelId, summary);

      await saveSummaryRecord(config.channelId, {
        period,
        summary,
        messageCount: messages.length,
        createdAt: new Date().toISOString(),
      });

      processed++;
      log.info(`Summary posted for ${config.channelId}`, { messageCount: messages.length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to generate summary for ${config.channelId}`, { error: msg });
      errors.push(`${config.channelId}: ${msg}`);
    }
  }

  return { processed, errors };
}
