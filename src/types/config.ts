export interface SummaryConfig {
  enabled: boolean;
  schedule: "daily" | "weekly" | "monthly";
  dayOfWeek: number; // 0=Sun, 1=Mon, ...
  time: string; // "09:00"
}

export interface NewsConfig {
  enabled: boolean;
  themes: string[];
  schedule: "daily" | "weekly";
  time: string;
}

export interface EngagementConfig {
  enabled: boolean;
  reactionFrequency: "low" | "medium" | "high";
  mentionFrequency: "low" | "medium" | "high";
  deepDiveFrequency: "low" | "medium" | "high";
}

export interface ChannelConfig {
  channelId: string;
  channelName: string;
  enabled: boolean;
  systemPrompt: string;
  model: string;
  summary: SummaryConfig;
  news: NewsConfig;
  engagement: EngagementConfig;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CHANNEL_CONFIG: Omit<ChannelConfig, "channelId" | "channelName"> = {
  enabled: true,
  systemPrompt:
    "あなたはSlackチャンネルの議論を活性化するAIアシスタントです。フレンドリーで知的な口調で、参加者の発言に対して深掘りの質問をしたり、有用な情報を共有してください。",
  model: "gpt-4.1",
  summary: {
    enabled: true,
    schedule: "weekly",
    dayOfWeek: 1,
    time: "09:00",
  },
  news: {
    enabled: false,
    themes: [],
    schedule: "daily",
    time: "08:00",
  },
  engagement: {
    enabled: true,
    reactionFrequency: "medium",
    mentionFrequency: "low",
    deepDiveFrequency: "medium",
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export interface SummaryRecord {
  period: string;
  summary: string;
  messageCount: number;
  createdAt: string;
}

export interface CachedMessage {
  ts: string;
  user: string;
  text: string;
  reactions?: { name: string; count: number }[];
  threadTs?: string | null;
}
