import { getOpenAI } from "./client";
import { DEEP_DIVE_PROMPT, MENTION_PROMPT, CONVERSATION_REPLY_PROMPT } from "./prompts";
import { CachedMessage, ChannelConfig } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("openai-discussion");

/**
 * Select an appropriate reaction emoji for a message.
 */
export async function selectReaction(messageText: string, model: string): Promise<string> {
  const openai = getOpenAI();

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "与えられたSlackメッセージに対して最も適切なリアクション絵文字を1つ選んでください。絵文字のショートコード名のみを返してください（コロンなし）。例: thumbsup, fire, eyes, rocket, heart, tada, thinking_face, bulb, sparkles, 100",
      },
      {
        role: "user",
        content: messageText,
      },
    ],
  });

  const emoji = response.output_text.trim().replace(/:/g, "");
  log.info(`Selected reaction: ${emoji}`);
  return emoji;
}

/**
 * Generate a deep-dive question or comment for a message.
 */
export async function generateDeepDive(
  messageText: string,
  config: ChannelConfig,
  recentContext: CachedMessage[] = []
): Promise<string> {
  const openai = getOpenAI();

  const contextStr = recentContext.length > 0
    ? `\n\n最近の会話コンテキスト:\n${recentContext.slice(-10).map((m) => `<@${m.user}>: ${m.text}`).join("\n")}`
    : "";

  const response = await openai.responses.create({
    model: config.model || "gpt-4.1",
    input: [
      {
        role: "system",
        content: config.systemPrompt
          ? `${DEEP_DIVE_PROMPT}\n\n追加指示: ${config.systemPrompt}`
          : DEEP_DIVE_PROMPT,
      },
      {
        role: "user",
        content: `以下の投稿について深掘りする質問やコメントを生成してください:\n\n「${messageText}」${contextStr}`,
      },
    ],
  });

  return response.output_text;
}

/**
 * Generate a mention message to engage a specific user.
 */
export async function generateMentionMessage(
  userId: string,
  recentMessages: CachedMessage[],
  config: ChannelConfig
): Promise<string> {
  const openai = getOpenAI();

  const contextStr = recentMessages
    .slice(-20)
    .map((m) => `<@${m.user}>: ${m.text}`)
    .join("\n");

  const response = await openai.responses.create({
    model: config.model || "gpt-4.1",
    input: [
      {
        role: "system",
        content: config.systemPrompt
          ? `${MENTION_PROMPT}\n\n追加指示: ${config.systemPrompt}`
          : MENTION_PROMPT,
      },
      {
        role: "user",
        content: `チャンネルの最近の会話:\n${contextStr}\n\n<@${userId}> に話を振るメッセージを生成してください。メッセージの中に <@${userId}> を含めてください。`,
      },
    ],
  });

  return response.output_text;
}

/**
 * Generate a reply to a user's mention/message.
 */
export async function generateReply(
  userMessage: string,
  config: ChannelConfig,
  recentContext: CachedMessage[] = []
): Promise<string> {
  const openai = getOpenAI();

  const contextStr = recentContext.length > 0
    ? `\n\n最近のチャンネルの会話:\n${recentContext.slice(-15).map((m) => `<@${m.user}>: ${m.text}`).join("\n")}`
    : "";

  const response = await openai.responses.create({
    model: config.model || "gpt-4.1",
    input: [
      {
        role: "system",
        content: config.systemPrompt
          ? `${CONVERSATION_REPLY_PROMPT}\n\n追加指示: ${config.systemPrompt}`
          : CONVERSATION_REPLY_PROMPT,
      },
      {
        role: "user",
        content: `${userMessage}${contextStr}`,
      },
    ],
  });

  return response.output_text;
}
