import { NextRequest, NextResponse } from "next/server";
import { getAllChannelConfigs, updateChannelConfig } from "@/lib/store/channel-config";
import { getSummaryHistory } from "@/lib/store/conversation-cache";

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.DASHBOARD_SECRET}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await getAllChannelConfigs();

  // Enrich with summary counts
  const channels = await Promise.all(
    configs.map(async (config) => {
      const summaries = await getSummaryHistory(config.channelId);
      return {
        ...config,
        summaryCount: summaries.length,
        lastSummary: summaries.length > 0 ? summaries[summaries.length - 1].createdAt : null,
      };
    })
  );

  return NextResponse.json({ channels });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { channelId, ...updates } = body;

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  const updated = await updateChannelConfig(channelId, updates);
  if (!updated) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  return NextResponse.json({ channel: updated });
}
