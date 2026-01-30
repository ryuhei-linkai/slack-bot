import { NextRequest, NextResponse } from "next/server";
import { runEngageJob } from "@/lib/cron/engage-job";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("cron-engage");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("Engagement cron job started");

  try {
    const result = await runEngageJob();
    log.info("Engagement cron job completed", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error("Engagement cron job failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
