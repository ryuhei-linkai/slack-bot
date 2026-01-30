import { WebClient } from "@slack/web-api";
import { getAllChannelConfigs } from "@/lib/store/channel-config";
import { generateNewsBrief } from "@/lib/openai/news";
import { postMessage } from "@/lib/slack/messages";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("news-job");

/**
 * Run the news delivery job for all configured channels.
 */
export async function runNewsJob(): Promise<{ processed: number; errors: string[] }> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN!);
  const configs = await getAllChannelConfigs();
  const errors: string[] = [];
  let processed = 0;

  for (const config of configs) {
    if (!config.enabled || !config.news.enabled || config.news.themes.length === 0) continue;

    try {
      log.info(`Generating news for ${config.channelId}`, { themes: config.news.themes });

      const news = await generateNewsBrief(config);
      await postMessage(client, config.channelId, news);

      processed++;
      log.info(`News posted for ${config.channelId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to deliver news for ${config.channelId}`, { error: msg });
      errors.push(`${config.channelId}: ${msg}`);
    }
  }

  return { processed, errors };
}
