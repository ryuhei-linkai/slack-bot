import { App, ExpressReceiver } from "@slack/bolt";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("slack-app");

let app: App | null = null;
let receiver: ExpressReceiver | null = null;

export function getReceiver(): ExpressReceiver {
  if (!receiver) {
    receiver = new ExpressReceiver({
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
      processBeforeResponse: true,
    });
  }
  return receiver;
}

export function getSlackApp(): App {
  if (!app) {
    const recv = getReceiver();
    app = new App({
      token: process.env.SLACK_BOT_TOKEN!,
      receiver: recv,
    });
    log.info("Slack App initialized");
  }
  return app;
}
