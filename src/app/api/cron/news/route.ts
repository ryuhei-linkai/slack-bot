import { NextRequest, NextResponse } from "next/server";
import { runNewsJob } from "@/lib/cron/news-job";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("cron-news");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("News cron job started");

  try {
    const result = await runNewsJob();
    log.info("News cron job completed", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error("News cron job failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
