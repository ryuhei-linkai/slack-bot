import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { WebClient } from "@slack/web-api";
import { handleMessageEvent, handleMentionEvent } from "@/lib/slack/events";
import {
  handleConfigCommand,
  handleSummaryCommand,
  handleThemeCommand,
  handleStatusCommand,
  handleConfigModalSubmission,
} from "@/lib/slack/commands";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("api-slack-events");

function getClient(): WebClient {
  return new WebClient(process.env.SLACK_BOT_TOKEN!);
}

/**
 * Verify Slack request signature.
 */
function verifySlackRequest(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!signature || !timestamp) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 60 * 5) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring, "utf8")
    .digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

/**
 * Main Slack events/commands/interactions endpoint.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  // Verify request
  if (!verifySlackRequest(signingSecret, signature, timestamp, rawBody)) {
    log.warn("Invalid Slack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse body
  const contentType = request.headers.get("content-type") || "";

  // Handle URL-encoded payloads (slash commands, interactions)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);

    // Interaction payload (modal submissions, etc.)
    const payloadStr = params.get("payload");
    if (payloadStr) {
      return handleInteraction(JSON.parse(payloadStr));
    }

    // Slash command
    const command = params.get("command");
    if (command) {
      return handleSlashCommand(params);
    }
  }

  // Handle JSON payloads (events)
  const body = JSON.parse(rawBody);

  // URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Event callback
  if (body.type === "event_callback") {
    // Process async (don't block the 3s response)
    const event = body.event;
    processEventAsync(event).catch((err) => {
      log.error("Failed to process event", { error: String(err) });
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Process events asynchronously.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEventAsync(event: any): Promise<void> {
  const client = getClient();

  switch (event.type) {
    case "app_mention":
      await handleMentionEvent(event, client);
      break;

    case "message":
      if (!event.subtype) {
        await handleMessageEvent(event);
      }
      break;

    default:
      log.info(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle slash commands.
 */
async function handleSlashCommand(params: URLSearchParams): Promise<NextResponse> {
  const client = getClient();
  const command = params.get("command")!;
  const payload = {
    command,
    text: params.get("text") || "",
    channel_id: params.get("channel_id")!,
    channel_name: params.get("channel_name") || "",
    user_id: params.get("user_id")!,
    trigger_id: params.get("trigger_id")!,
  };

  log.info(`Slash command: ${command}`, { channelId: payload.channel_id });

  try {
    let responseText = "";

    switch (command) {
      case "/discuss-config":
        responseText = await handleConfigCommand(payload, client);
        break;
      case "/discuss-summary":
        // Return immediate ack, process in background
        handleSummaryCommand(payload, client).catch((err) => {
          log.error("Summary command failed", { error: String(err) });
        });
        responseText = ":hourglass_flowing_sand: 要約を生成中です...";
        break;
      case "/discuss-theme":
        responseText = await handleThemeCommand(payload);
        break;
      case "/discuss-status":
        responseText = await handleStatusCommand(payload);
        break;
      default:
        responseText = `未知のコマンドです: ${command}`;
    }

    return NextResponse.json({
      response_type: "ephemeral",
      text: responseText,
    });
  } catch (error) {
    log.error(`Command failed: ${command}`, { error: String(error) });
    return NextResponse.json({
      response_type: "ephemeral",
      text: ":x: エラーが発生しました。しばらくしてからもう一度お試しください。",
    });
  }
}

/**
 * Handle interaction payloads (modal submissions).
 */
async function handleInteraction(payload: Record<string, unknown>): Promise<NextResponse> {
  if (payload.type === "view_submission") {
    const view = payload.view as {
      callback_id: string;
      private_metadata: string;
      state: { values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>> };
    };

    if (view.callback_id === "config_modal") {
      const channelId = view.private_metadata;
      await handleConfigModalSubmission(channelId, view.state.values);
      return NextResponse.json({ response_action: "clear" });
    }
  }

  return NextResponse.json({ ok: true });
}
