import { getOpenAI } from "./client";
import { NEWS_PROMPT } from "./prompts";
import { ChannelConfig } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("openai-news");

/**
 * Fetch and explain news using OpenAI's web_search tool.
 */
export async function generateNewsBrief(config: ChannelConfig): Promise<string> {
  const openai = getOpenAI();
  const themes = config.news.themes;

  if (themes.length === 0) {
    return ":warning: ニューステーマが設定されていません。`/discuss-theme テーマ名` で設定してください。";
  }

  log.info(`Generating news brief for themes: ${themes.join(", ")}`);

  const response = await openai.responses.create({
    model: config.model || "gpt-4.1",
    tools: [
      {
        type: "web_search" as "web_search_preview",
      },
    ],
    input: [
      {
        role: "system",
        content: config.systemPrompt
          ? `${NEWS_PROMPT}\n\n追加指示: ${config.systemPrompt}`
          : NEWS_PROMPT,
      },
      {
        role: "user",
        content: `以下のテーマに関する本日の最新ニュースを検索し、日本語で分かりやすく解説してください。\n\nテーマ: ${themes.join(", ")}`,
      },
    ],
  });

  return response.output_text;
}
