import { NextRequest, NextResponse } from "next/server";
import { runSummaryJob } from "@/lib/cron/summary-job";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("cron-summary");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("Summary cron job started");

  try {
    const result = await runSummaryJob();
    log.info("Summary cron job completed", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error("Summary cron job failed", { error: String(error) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
