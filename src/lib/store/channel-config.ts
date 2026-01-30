import { getRedis } from "./redis";
import { ChannelConfig, DEFAULT_CHANNEL_CONFIG } from "@/types/config";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("channel-config");

function configKey(channelId: string): string {
  return `channel_config:${channelId}`;
}

export async function getChannelConfig(channelId: string): Promise<ChannelConfig | null> {
  const redis = getRedis();
  const data = await redis.get<ChannelConfig>(configKey(channelId));
  return data;
}

export async function getOrCreateChannelConfig(
  channelId: string,
  channelName: string
): Promise<ChannelConfig> {
  const existing = await getChannelConfig(channelId);
  if (existing) return existing;

  const config: ChannelConfig = {
    ...DEFAULT_CHANNEL_CONFIG,
    channelId,
    channelName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveChannelConfig(config);
  log.info(`Created default config for channel ${channelName}`, { channelId });
  return config;
}

export async function saveChannelConfig(config: ChannelConfig): Promise<void> {
  const redis = getRedis();
  config.updatedAt = new Date().toISOString();
  await redis.set(configKey(config.channelId), config);
}

export async function updateChannelConfig(
  channelId: string,
  updates: Partial<ChannelConfig>
): Promise<ChannelConfig | null> {
  const existing = await getChannelConfig(channelId);
  if (!existing) return null;

  const updated: ChannelConfig = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await saveChannelConfig(updated);
  log.info(`Updated config for channel ${channelId}`);
  return updated;
}

export async function getAllChannelConfigs(): Promise<ChannelConfig[]> {
  const redis = getRedis();
  const keys = await redis.keys("channel_config:*");
  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
  }
  const results = await pipeline.exec<(ChannelConfig | null)[]>();
  return results.filter((c): c is ChannelConfig => c !== null);
}

export async function deleteChannelConfig(channelId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(configKey(channelId));
}
