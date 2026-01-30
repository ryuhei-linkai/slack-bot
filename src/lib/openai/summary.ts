import { getOpenAI } from "./client";
import { SUMMARY_PROMPT } from "./prompts";
import { CachedMessage, ChannelConfig } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("openai-summary");

/**
 * Generate a summary of channel messages using OpenAI.
 */
export async function generateSummary(
  messages: CachedMessage[],
  config: ChannelConfig,
  period: string
): Promise<string> {
  const openai = getOpenAI();

  if (messages.length === 0) {
    return `:memo: *チャンネル要約*\n\n*期間*: ${period}\n\nこの期間にはメッセージがありませんでした。`;
  }

  // Format messages for context, limit to avoid token overflow
  const maxMessages = 300;
  const trimmed = messages.slice(-maxMessages);
  const formatted = trimmed
    .map((m) => {
      const reactions = m.reactions?.length
        ? ` [リアクション: ${m.reactions.map((r) => `:${r.name}: x${r.count}`).join(", ")}]`
        : "";
      return `<@${m.user}>: ${m.text}${reactions}`;
    })
    .join("\n");

  const userPrompt = `以下は「${config.channelName}」チャンネルの会話履歴です。要約を作成してください。

期間: ${period}
メッセージ数: ${messages.length}件${messages.length > maxMessages ? `（直近${maxMessages}件を表示）` : ""}

---
${formatted}
---`;

  log.info(`Generating summary for ${config.channelId}`, {
    messageCount: messages.length,
    period,
  });

  const response = await openai.responses.create({
    model: config.model || "gpt-4.1",
    input: [
      { role: "system", content: config.systemPrompt ? `${SUMMARY_PROMPT}\n\n追加指示: ${config.systemPrompt}` : SUMMARY_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  return response.output_text;
}
