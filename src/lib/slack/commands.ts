import { WebClient } from "@slack/web-api";
import {
  getOrCreateChannelConfig,
  updateChannelConfig,
  getChannelConfig,
} from "@/lib/store/channel-config";
import { getCachedMessages, saveSummaryRecord } from "@/lib/store/conversation-cache";
import { fetchChannelHistory, fetchChannelInfo } from "@/lib/slack/history";
import { postMessage } from "@/lib/slack/messages";
import { generateSummary } from "@/lib/openai/summary";
import { CachedMessage, ChannelConfig } from "@/types/config";
import { setCachedMessages } from "@/lib/store/conversation-cache";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("slack-commands");

interface SlackCommandPayload {
  command: string;
  text: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  trigger_id: string;
}

/**
 * Handle /discuss-config command: open a config modal.
 */
export async function handleConfigCommand(
  payload: SlackCommandPayload,
  client: WebClient
): Promise<string> {
  const config = await getOrCreateChannelConfig(payload.channel_id, payload.channel_name);

  await client.views.open({
    trigger_id: payload.trigger_id,
    view: buildConfigModal(config),
  });

  return "";
}

/**
 * Handle /discuss-summary command: generate summary on demand.
 */
export async function handleSummaryCommand(
  payload: SlackCommandPayload,
  client: WebClient
): Promise<string> {
  const config = await getOrCreateChannelConfig(payload.channel_id, payload.channel_name);

  // Parse period: "1d", "1w", "1m" or default "1w"
  const periodArg = payload.text.trim().toLowerCase() || "1w";
  const now = new Date();
  let startDate: Date;
  let periodLabel: string;

  if (periodArg === "1d" || periodArg === "day") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    periodLabel = "過去1日";
  } else if (periodArg === "1m" || periodArg === "month") {
    startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 1);
    periodLabel = "過去1ヶ月";
  } else {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    periodLabel = "過去1週間";
  }

  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);

  // Try cache first, fall back to API
  let messages = await getCachedMessages(config.channelId, startStr, endStr);

  if (messages.length === 0) {
    const oldest = (startDate.getTime() / 1000).toString();
    const latest = (now.getTime() / 1000).toString();
    const fetched = await fetchChannelHistory(client, config.channelId, { oldest, latest });

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

  const period = `${startStr} 〜 ${endStr}（${periodLabel}）`;
  const summary = await generateSummary(messages, config, period);

  await postMessage(client, config.channelId, summary);

  await saveSummaryRecord(config.channelId, {
    period,
    summary,
    messageCount: messages.length,
    createdAt: new Date().toISOString(),
  });

  return "要約を生成しました :white_check_mark:";
}

/**
 * Handle /discuss-theme command: set news themes.
 */
export async function handleThemeCommand(
  payload: SlackCommandPayload
): Promise<string> {
  const themeText = payload.text.trim();

  if (!themeText) {
    const config = await getChannelConfig(payload.channel_id);
    if (config?.news.themes.length) {
      return `現在のテーマ: ${config.news.themes.join(", ")}\n\n変更するには: \`/discuss-theme テーマ1, テーマ2\``;
    }
    return "テーマを指定してください: `/discuss-theme AI, 機械学習, LLM`";
  }

  const themes = themeText.split(",").map((t) => t.trim()).filter(Boolean);
  await getOrCreateChannelConfig(payload.channel_id, payload.channel_name);
  await updateChannelConfig(payload.channel_id, {
    news: {
      enabled: true,
      themes,
      schedule: "daily",
      time: "08:00",
    },
  });

  return `:white_check_mark: ニューステーマを設定しました: ${themes.join(", ")}\n毎日ニュースを配信します。`;
}

/**
 * Handle /discuss-status command: show current config.
 */
export async function handleStatusCommand(
  payload: SlackCommandPayload
): Promise<string> {
  const config = await getChannelConfig(payload.channel_id);

  if (!config) {
    return "このチャンネルにはまだBotが設定されていません。`/discuss-config` で設定を開始してください。";
  }

  const status = config.enabled ? ":white_check_mark: 有効" : ":x: 無効";
  const summaryStatus = config.summary.enabled
    ? `:white_check_mark: ${config.summary.schedule}（${config.summary.time}）`
    : ":x: 無効";
  const newsStatus = config.news.enabled
    ? `:white_check_mark: テーマ: ${config.news.themes.join(", ")}（${config.news.schedule}）`
    : ":x: 無効";
  const engageStatus = config.engagement.enabled
    ? `:white_check_mark: リアクション:${config.engagement.reactionFrequency} / 深掘り:${config.engagement.deepDiveFrequency} / メンション:${config.engagement.mentionFrequency}`
    : ":x: 無効";

  return `:gear: *DiscussionBot 設定状態*

*ステータス*: ${status}
*モデル*: \`${config.model}\`

:memo: *要約*: ${summaryStatus}
:newspaper: *ニュース*: ${newsStatus}
:speech_balloon: *議論活性化*: ${engageStatus}

*システムプロンプト*:
\`\`\`
${config.systemPrompt.slice(0, 200)}${config.systemPrompt.length > 200 ? "..." : ""}
\`\`\`

_設定変更は \`/discuss-config\` から_`;
}

/**
 * Build the config modal view for Slack Block Kit.
 */
function buildConfigModal(config: ChannelConfig) {
  return {
    type: "modal" as const,
    callback_id: "config_modal",
    title: { type: "plain_text" as const, text: "Bot設定" },
    submit: { type: "plain_text" as const, text: "保存" },
    close: { type: "plain_text" as const, text: "キャンセル" },
    private_metadata: config.channelId,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*チャンネル*: #${config.channelName}`,
        },
      },
      {
        type: "input",
        block_id: "enabled_block",
        label: { type: "plain_text" as const, text: "Bot有効/無効" },
        element: {
          type: "static_select",
          action_id: "enabled",
          initial_option: {
            text: { type: "plain_text" as const, text: config.enabled ? "有効" : "無効" },
            value: config.enabled ? "true" : "false",
          },
          options: [
            { text: { type: "plain_text" as const, text: "有効" }, value: "true" },
            { text: { type: "plain_text" as const, text: "無効" }, value: "false" },
          ],
        },
      },
      {
        type: "input",
        block_id: "model_block",
        label: { type: "plain_text" as const, text: "AIモデル" },
        element: {
          type: "static_select",
          action_id: "model",
          initial_option: {
            text: { type: "plain_text" as const, text: config.model },
            value: config.model,
          },
          options: [
            { text: { type: "plain_text" as const, text: "gpt-4.1" }, value: "gpt-4.1" },
            { text: { type: "plain_text" as const, text: "gpt-4.1-mini" }, value: "gpt-4.1-mini" },
            { text: { type: "plain_text" as const, text: "gpt-4.1-nano" }, value: "gpt-4.1-nano" },
            { text: { type: "plain_text" as const, text: "gpt-5" }, value: "gpt-5" },
            { text: { type: "plain_text" as const, text: "gpt-5.2" }, value: "gpt-5.2" },
          ],
        },
      },
      {
        type: "input",
        block_id: "prompt_block",
        label: { type: "plain_text" as const, text: "システムプロンプト" },
        element: {
          type: "plain_text_input",
          action_id: "system_prompt",
          multiline: true,
          initial_value: config.systemPrompt,
          max_length: 2000,
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "summary_enabled_block",
        label: { type: "plain_text" as const, text: "定期要約" },
        element: {
          type: "static_select",
          action_id: "summary_enabled",
          initial_option: {
            text: { type: "plain_text" as const, text: config.summary.enabled ? "有効" : "無効" },
            value: config.summary.enabled ? "true" : "false",
          },
          options: [
            { text: { type: "plain_text" as const, text: "有効" }, value: "true" },
            { text: { type: "plain_text" as const, text: "無効" }, value: "false" },
          ],
        },
      },
      {
        type: "input",
        block_id: "summary_schedule_block",
        label: { type: "plain_text" as const, text: "要約スケジュール" },
        element: {
          type: "static_select",
          action_id: "summary_schedule",
          initial_option: {
            text: { type: "plain_text" as const, text: config.summary.schedule },
            value: config.summary.schedule,
          },
          options: [
            { text: { type: "plain_text" as const, text: "daily" }, value: "daily" },
            { text: { type: "plain_text" as const, text: "weekly" }, value: "weekly" },
            { text: { type: "plain_text" as const, text: "monthly" }, value: "monthly" },
          ],
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "news_themes_block",
        label: { type: "plain_text" as const, text: "ニューステーマ（カンマ区切り）" },
        optional: true,
        element: {
          type: "plain_text_input",
          action_id: "news_themes",
          initial_value: config.news.themes.join(", "),
          placeholder: { type: "plain_text" as const, text: "AI, 機械学習, LLM" },
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "engage_reaction_block",
        label: { type: "plain_text" as const, text: "リアクション頻度" },
        element: {
          type: "static_select",
          action_id: "engage_reaction",
          initial_option: {
            text: { type: "plain_text" as const, text: config.engagement.reactionFrequency },
            value: config.engagement.reactionFrequency,
          },
          options: [
            { text: { type: "plain_text" as const, text: "low" }, value: "low" },
            { text: { type: "plain_text" as const, text: "medium" }, value: "medium" },
            { text: { type: "plain_text" as const, text: "high" }, value: "high" },
          ],
        },
      },
      {
        type: "input",
        block_id: "engage_deepdive_block",
        label: { type: "plain_text" as const, text: "深掘り頻度" },
        element: {
          type: "static_select",
          action_id: "engage_deepdive",
          initial_option: {
            text: { type: "plain_text" as const, text: config.engagement.deepDiveFrequency },
            value: config.engagement.deepDiveFrequency,
          },
          options: [
            { text: { type: "plain_text" as const, text: "low" }, value: "low" },
            { text: { type: "plain_text" as const, text: "medium" }, value: "medium" },
            { text: { type: "plain_text" as const, text: "high" }, value: "high" },
          ],
        },
      },
      {
        type: "input",
        block_id: "engage_mention_block",
        label: { type: "plain_text" as const, text: "メンション頻度" },
        element: {
          type: "static_select",
          action_id: "engage_mention",
          initial_option: {
            text: { type: "plain_text" as const, text: config.engagement.mentionFrequency },
            value: config.engagement.mentionFrequency,
          },
          options: [
            { text: { type: "plain_text" as const, text: "low" }, value: "low" },
            { text: { type: "plain_text" as const, text: "medium" }, value: "medium" },
            { text: { type: "plain_text" as const, text: "high" }, value: "high" },
          ],
        },
      },
    ],
  };
}

/**
 * Handle modal submission from /discuss-config.
 */
export async function handleConfigModalSubmission(
  channelId: string,
  values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>
): Promise<void> {
  const getValue = (blockId: string, actionId: string): string => {
    return (
      values[blockId]?.[actionId]?.selected_option?.value ||
      values[blockId]?.[actionId]?.value ||
      ""
    );
  };

  const newsThemesRaw = getValue("news_themes_block", "news_themes");
  const newsThemes = newsThemesRaw
    ? newsThemesRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  await updateChannelConfig(channelId, {
    enabled: getValue("enabled_block", "enabled") === "true",
    model: getValue("model_block", "model") || "gpt-4.1",
    systemPrompt: getValue("prompt_block", "system_prompt"),
    summary: {
      enabled: getValue("summary_enabled_block", "summary_enabled") === "true",
      schedule: getValue("summary_schedule_block", "summary_schedule") as "daily" | "weekly" | "monthly",
      dayOfWeek: 1,
      time: "09:00",
    },
    news: {
      enabled: newsThemes.length > 0,
      themes: newsThemes,
      schedule: "daily",
      time: "08:00",
    },
    engagement: {
      enabled: true,
      reactionFrequency: getValue("engage_reaction_block", "engage_reaction") as "low" | "medium" | "high",
      deepDiveFrequency: getValue("engage_deepdive_block", "engage_deepdive") as "low" | "medium" | "high",
      mentionFrequency: getValue("engage_mention_block", "engage_mention") as "low" | "medium" | "high",
    },
  });

  log.info(`Config updated for channel ${channelId}`);
}
