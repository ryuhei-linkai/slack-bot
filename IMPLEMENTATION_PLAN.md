# 議論活性化 Slack Bot — 実装計画書

## 1. プロジェクト概要

Slackチャンネルの議論を活性化するAI Botを構築する。
チャンネルの会話履歴を読み込み、要約生成・深掘り質問・リアクション・ニュース配信などを自律的に行う。

### 主要機能

| # | 機能 | 説明 |
|---|------|------|
| 1 | チャンネル参加・会話 | Botをチャンネルに招待し、メンションで会話できる |
| 2 | 会話履歴読み込み | チャンネルの過去メッセージを全取得 |
| 3 | 定期要約 | 週1回など、会話を要約して投稿 |
| 4 | 議論活性化 | メッセージへのリアクション付与、深掘り質問の投稿 |
| 5 | メンション振り | ランダムにチャンネル参加者にメンションして話を振る |
| 6 | ニュース配信 | 設定テーマに関連するニュースを取得・解説して毎日投稿 |
| 7 | 設定管理 | スラッシュコマンド + 管理ダッシュボードで設定変更 |

---

## 2. 技術スタック

### 2.1 フレームワーク・ランタイム

| 技術 | 選定理由 |
|------|----------|
| **Next.js 15 (App Router)** | Vercelとの最高の統合、API Routes + フロントエンド(ダッシュボード)を1プロジェクトで構築可能 |
| **TypeScript** | 型安全性、大規模プロジェクトの保守性 |
| **@slack/bolt** + **@vercel/slack-bolt** | Slack公式フレームワーク。`@vercel/slack-bolt` アダプターによりVercelの3秒タイムアウト問題を `waitUntil` で解決 |

### 2.2 AI・外部API

| 技術 | 用途 |
|------|------|
| **OpenAI Responses API** | GPT-5.2 (最新モデル) を使用。`web_search` ツールでリアルタイム検索も可能 |
| **OpenAI `gpt-5-search-api`** | ニュース検索特化。テーマに関連するニュースをWeb検索で取得 |
| **NewsAPI.org** (補助) | OpenAIのWeb検索で足りない場合の補助ニュースソース (150,000+ソース、14言語) |

### 2.3 インフラ・データ

| 技術 | 用途 |
|------|------|
| **Vercel** | ホスティング・デプロイ。Serverless Functions + Edge Functions |
| **Vercel Cron Jobs** | 定期実行（週次要約、日次ニュース配信、議論活性化） |
| **Upstash Redis** | Bot設定・チャンネル設定・会話キャッシュの永続化。Vercel Marketplace経由で統合 |

> **注意**: Vercel KVは2025年にサンセットされたため、代わりにUpstash Redisを直接利用する。

---

## 3. Slack App 設定

### 3.1 必要な OAuth Scopes (Bot Token)

```
# メッセージ関連
chat:write          - メッセージ送信
channels:history    - パブリックチャンネルの履歴取得
groups:history      - プライベートチャンネルの履歴取得
channels:read       - チャンネル情報の取得
groups:read         - プライベートチャンネル情報の取得

# リアクション
reactions:write     - スタンプ(リアクション)付与
reactions:read      - リアクションの読み取り

# ユーザー・メンバー
users:read          - ユーザー情報の取得
channels:join       - パブリックチャンネルへの参加

# コマンド
commands            - スラッシュコマンドの登録

# App Home
app_mentions:read   - @メンションの受信 (Events API経由)
```

### 3.2 Event Subscriptions (Bot Events)

```
app_mention         - Botへのメンション検知
message.channels    - パブリックチャンネルのメッセージ検知
message.groups      - プライベートチャンネルのメッセージ検知
member_joined_channel - チャンネル参加の検知
```

### 3.3 Slash Commands

| コマンド | 説明 |
|----------|------|
| `/discuss-config` | Bot設定メニューを表示（モーダル） |
| `/discuss-summary` | 手動で要約を生成 |
| `/discuss-theme` | ニュース配信テーマを設定 |
| `/discuss-status` | 現在の設定状態を表示 |

### 3.4 Manifest (App設定ファイル)

```json
{
  "display_information": {
    "name": "Discussion Bot",
    "description": "チャンネルの議論を活性化するAI Bot",
    "background_color": "#1a1a2e"
  },
  "features": {
    "bot_user": {
      "display_name": "DiscussionBot",
      "always_online": true
    },
    "slash_commands": [
      {
        "command": "/discuss-config",
        "description": "Bot設定メニューを表示",
        "usage_hint": "",
        "should_escape": false
      },
      {
        "command": "/discuss-summary",
        "description": "要約を手動生成",
        "usage_hint": "[期間: 1d/1w/1m]",
        "should_escape": false
      },
      {
        "command": "/discuss-theme",
        "description": "ニューステーマを設定",
        "usage_hint": "[テーマ名]",
        "should_escape": false
      },
      {
        "command": "/discuss-status",
        "description": "現在の設定を表示",
        "usage_hint": "",
        "should_escape": false
      }
    ]
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "channels:join",
        "channels:read",
        "chat:write",
        "commands",
        "groups:history",
        "groups:read",
        "reactions:read",
        "reactions:write",
        "users:read"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "message.channels",
        "message.groups",
        "member_joined_channel"
      ]
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

---

## 4. プロジェクト構造

```
slack-bot/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/
│   │   │   ├── slack/
│   │   │   │   └── events/
│   │   │   │       └── route.ts      # Slack Events/Commands エンドポイント
│   │   │   └── cron/
│   │   │       ├── summary/
│   │   │       │   └── route.ts      # 定期要約 Cron
│   │   │       ├── news/
│   │   │       │   └── route.ts      # ニュース配信 Cron
│   │   │       └── engage/
│   │   │           └── route.ts      # 議論活性化 Cron
│   │   ├── dashboard/                # 管理ダッシュボード
│   │   │   ├── page.tsx              # ダッシュボードメイン
│   │   │   └── layout.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── lib/
│   │   ├── slack/
│   │   │   ├── app.ts               # Bolt App 初期化
│   │   │   ├── commands.ts           # スラッシュコマンドハンドラ
│   │   │   ├── events.ts            # イベントハンドラ (メンション、メッセージ)
│   │   │   ├── messages.ts          # メッセージ送信ユーティリティ
│   │   │   └── history.ts           # 会話履歴取得
│   │   │
│   │   ├── openai/
│   │   │   ├── client.ts            # OpenAI クライアント初期化
│   │   │   ├── summary.ts           # 要約生成
│   │   │   ├── discussion.ts        # 議論活性化 (深掘り質問、コメント生成)
│   │   │   ├── news.ts              # ニュース検索・解説生成
│   │   │   └── prompts.ts           # システムプロンプト定義
│   │   │
│   │   ├── store/
│   │   │   ├── redis.ts             # Upstash Redis クライアント
│   │   │   ├── channel-config.ts    # チャンネルごとの設定管理
│   │   │   └── conversation-cache.ts # 会話キャッシュ
│   │   │
│   │   ├── cron/
│   │   │   ├── summary-job.ts       # 要約ジョブロジック
│   │   │   ├── news-job.ts          # ニュース配信ジョブロジック
│   │   │   └── engage-job.ts        # 議論活性化ジョブロジック
│   │   │
│   │   └── utils/
│   │       ├── rate-limit.ts        # Slack APIレート制限対応
│   │       └── logger.ts            # ロギング
│   │
│   └── types/
│       ├── config.ts                # 設定型定義
│       └── slack.ts                 # Slack関連型定義
│
├── public/                           # 静的ファイル
├── vercel.json                       # Vercel設定 (Cron定義含む)
├── next.config.ts                    # Next.js設定
├── package.json
├── tsconfig.json
├── .env.example                      # 環境変数テンプレート
├── .env.local                        # ローカル開発用 (gitignore対象)
└── .gitignore
```

---

## 5. データモデル (Upstash Redis)

### 5.1 チャンネル設定

```
Key: channel_config:{channel_id}
Value: {
  "channelId": "C1234567890",
  "channelName": "#ai-news",
  "enabled": true,
  "systemPrompt": "あなたはAIニュースの専門家です...",
  "model": "gpt-5.2",
  "summary": {
    "enabled": true,
    "schedule": "weekly",        // "daily" | "weekly" | "monthly"
    "dayOfWeek": 1,              // 0=日, 1=月, ...
    "time": "09:00"
  },
  "news": {
    "enabled": true,
    "themes": ["AI", "機械学習", "LLM"],
    "schedule": "daily",
    "time": "08:00"
  },
  "engagement": {
    "enabled": true,
    "reactionFrequency": "medium",  // "low" | "medium" | "high"
    "mentionFrequency": "low",      // "low" | "medium" | "high"
    "deepDiveFrequency": "medium"
  },
  "createdAt": "2026-01-30T00:00:00Z",
  "updatedAt": "2026-01-30T00:00:00Z"
}
```

### 5.2 会話キャッシュ

```
Key: conversation_cache:{channel_id}:{date}
Value: [
  {
    "ts": "1706000000.000000",
    "user": "U1234567890",
    "text": "最近のGPT-5の進化がすごい...",
    "reactions": [{"name": "thumbsup", "count": 3}],
    "threadTs": null
  },
  ...
]
TTL: 30日
```

### 5.3 要約履歴

```
Key: summary_history:{channel_id}
Value: [
  {
    "period": "2026-01-20 ~ 2026-01-26",
    "summary": "今週の主なトピック...",
    "messageCount": 42,
    "createdAt": "2026-01-27T09:00:00Z"
  },
  ...
]
```

---

## 6. 主要機能の実装詳細

### 6.1 会話履歴の取得

```typescript
// src/lib/slack/history.ts
import { WebClient } from '@slack/web-api';

async function fetchChannelHistory(
  client: WebClient,
  channelId: string,
  oldest?: string,  // Unix timestamp
  latest?: string
): Promise<Message[]> {
  const messages: Message[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.conversations.history({
      channel: channelId,
      oldest,
      latest,
      limit: 200,       // Slack推奨最大値
      cursor,
    });

    if (result.messages) {
      messages.push(...result.messages);
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  return messages.reverse(); // 時系列順に
}
```

**注意**: 2025年5月以降、Marketplace外アプリは `conversations.history` が1分に1リクエストに制限される。
これに対応するため、レート制限付きのリトライロジックを実装し、取得済みデータはRedisにキャッシュする。

### 6.2 定期要約の生成

```typescript
// src/lib/openai/summary.ts
import OpenAI from 'openai';

async function generateSummary(
  messages: Message[],
  config: ChannelConfig
): Promise<string> {
  const client = new OpenAI();

  const formattedMessages = messages.map(m =>
    `[${m.user}] ${m.text}`
  ).join('\n');

  const response = await client.responses.create({
    model: config.model || 'gpt-5.2',
    input: [
      {
        role: 'system',
        content: config.systemPrompt || DEFAULT_SUMMARY_PROMPT,
      },
      {
        role: 'user',
        content: `以下は${config.channelName}チャンネルの会話履歴です。要約を作成してください。\n\n${formattedMessages}`,
      },
    ],
  });

  return response.output_text;
}
```

### 6.3 議論活性化（深掘り・リアクション・メンション）

```typescript
// src/lib/openai/discussion.ts

// 1. メッセージへのリアクション付与
async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  emoji: string
) {
  await client.reactions.add({
    channel,
    timestamp,
    name: emoji,  // e.g. "eyes", "fire", "thinking_face"
  });
}

// 2. 深掘り質問の生成
async function generateDeepDiveQuestion(
  message: string,
  context: Message[]
): Promise<string> {
  const openai = new OpenAI();
  const response = await openai.responses.create({
    model: 'gpt-5.2',
    input: [
      {
        role: 'system',
        content: DEEP_DIVE_PROMPT,
      },
      {
        role: 'user',
        content: `この投稿について深掘りする質問を1つ生成してください:\n${message}`,
      },
    ],
  });
  return response.output_text;
}

// 3. ランダムメンション
async function mentionRandomMember(
  client: WebClient,
  channelId: string
): Promise<string> {
  const result = await client.conversations.members({
    channel: channelId,
    limit: 200,
  });

  const members = result.members?.filter(m => m !== BOT_USER_ID) || [];
  const randomMember = members[Math.floor(Math.random() * members.length)];
  return `<@${randomMember}>`;
}
```

### 6.4 ニュース検索・配信

```typescript
// src/lib/openai/news.ts
import OpenAI from 'openai';

async function fetchAndExplainNews(
  themes: string[]
): Promise<string> {
  const client = new OpenAI();

  const response = await client.responses.create({
    model: 'gpt-5.2',
    tools: [{ type: 'web_search' }],   // Web検索ツール有効化
    input: [
      {
        role: 'system',
        content: NEWS_SEARCH_PROMPT,
      },
      {
        role: 'user',
        content: `以下のテーマに関する本日の最新ニュースを検索し、日本語で分かりやすく解説してください。\nテーマ: ${themes.join(', ')}`,
      },
    ],
  });

  return response.output_text;
}
```

**ポイント**: OpenAI Responses APIの `web_search` ツールを使えば、外部ニュースAPIなしでリアルタイムのニュース取得が可能。
`gpt-5-search-api` モデルを使えば検索に特化した結果も得られる。引用元URLも自動で付与される。

### 6.5 スラッシュコマンドハンドラ

```typescript
// src/lib/slack/commands.ts

// /discuss-config: 設定モーダルを表示
app.command('/discuss-config', async ({ ack, body, client }) => {
  await ack();

  const config = await getChannelConfig(body.channel_id);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildConfigModal(config),
  });
});

// /discuss-theme: テーマ設定
app.command('/discuss-theme', async ({ ack, body, respond }) => {
  await ack();

  const theme = body.text.trim();
  if (!theme) {
    await respond('テーマを指定してください: `/discuss-theme AI, 機械学習`');
    return;
  }

  const themes = theme.split(',').map(t => t.trim());
  await updateChannelConfig(body.channel_id, { news: { themes } });
  await respond(`ニューステーマを設定しました: ${themes.join(', ')}`);
});
```

---

## 7. Vercel Cron 設定

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/summary",
      "schedule": "0 0 * * 1"
    },
    {
      "path": "/api/cron/news",
      "schedule": "0 23 * * *"
    },
    {
      "path": "/api/cron/engage",
      "schedule": "0 */3 * * *"
    }
  ]
}
```

| Cron Job | スケジュール | 説明 |
|----------|-------------|------|
| `/api/cron/summary` | 毎週月曜 09:00 JST (0:00 UTC) | 週次要約を生成・投稿 |
| `/api/cron/news` | 毎日 08:00 JST (23:00 UTC前日) | テーマ別ニュースを検索・配信 |
| `/api/cron/engage` | 3時間ごと | 新しいメッセージを確認し、リアクション・深掘り・メンションを実行 |

**Cron認証**: Vercelは `CRON_SECRET` 環境変数を設定すると、Cronリクエストに `Authorization: Bearer <CRON_SECRET>` ヘッダーを付与する。API Route側でこれを検証する。

```typescript
// src/app/api/cron/summary/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 要約ジョブ実行
  await runSummaryJob();
  return Response.json({ success: true });
}
```

---

## 8. 管理ダッシュボード

シンプルなNext.js App Routerページとして実装する。

### 8.1 機能

- チャンネル一覧と各チャンネルの設定状態
- チャンネルごとの設定変更（プロンプト、スケジュール、モデル、テーマ）
- 要約履歴の閲覧
- ニュース配信履歴の閲覧
- 手動実行ボタン（要約・ニュース・活性化）

### 8.2 認証

- Slack OAuth を利用してダッシュボードへのアクセスを制限
- ワークスペースの管理者のみアクセス可能にする

### 8.3 UI

- **Tailwind CSS** + **shadcn/ui** でシンプルに構築
- レスポンシブ対応

---

## 9. 環境変数

```bash
# .env.example

# Slack
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_APP_TOKEN=xapp-1-xxxxxxxxxxxx-xxxxxxxxxxxxxxxx  # Socket Mode用 (開発時)

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Vercel Cron
CRON_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# App
BOT_USER_ID=U0XXXXXXXXX
```

---

## 10. 実装フェーズ

### Phase 1: 基盤構築 (MVP)

1. Next.jsプロジェクト初期化（TypeScript, Tailwind CSS）
2. Slack App作成・Bolt初期化（`@vercel/slack-bolt`）
3. `/api/slack/events` エンドポイント構築
4. メンション応答（`app_mention` イベント → OpenAI → 返信）
5. Upstash Redis接続・チャンネル設定の保存/取得
6. Vercelデプロイ・Slack Event URLの設定

### Phase 2: 会話履歴 + 要約

7. `conversations.history` による会話履歴取得
8. レート制限対応・Redis キャッシュ
9. OpenAI Responses APIで要約生成
10. `/api/cron/summary` のCronジョブ実装
11. `/discuss-summary` スラッシュコマンド（手動要約）

### Phase 3: 議論活性化

12. メッセージ受信時のリアクション付与ロジック
13. 深掘り質問の生成・スレッド返信
14. チャンネルメンバー取得 → ランダムメンション
15. `/api/cron/engage` のCronジョブ実装
16. 頻度設定（low/medium/high）の実装

### Phase 4: ニュース配信

17. OpenAI `web_search` ツールを使ったニュース検索
18. ニュース解説文の生成
19. `/api/cron/news` のCronジョブ実装
20. `/discuss-theme` スラッシュコマンド

### Phase 5: 設定・ダッシュボード

21. `/discuss-config` モーダル実装（Slack Block Kit）
22. `/discuss-status` ステータス表示
23. 管理ダッシュボード（Next.js ページ）
24. Slack OAuth認証
25. 設定UI（プロンプト、スケジュール、モデル選択など）

### Phase 6: 品質向上

26. エラーハンドリング・リトライ強化
27. ロギング・モニタリング
28. レート制限の最適化
29. プロンプトチューニング
30. README・ドキュメント整備

---

## 11. 主要依存パッケージ

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "@slack/bolt": "^4.0.0",
    "@vercel/slack-bolt": "^1.0.0",
    "openai": "^5.0.0",
    "@upstash/redis": "^1.34.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

---

## 12. アーキテクチャ図

```
┌──────────────────────────────────────────────────────────────┐
│                         Slack                                │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │ Events  │  │ Commands │  │ Reactions │  │ Messages   │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └─────┬──────┘  │
└───────┼────────────┼──────────────┼───────────────┼─────────┘
        │            │              │               │
        ▼            ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Vercel (Next.js)                           │
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │  /api/slack/events                    │ ◄── Slack Webhook │
│  │  (@vercel/slack-bolt + waitUntil)     │                    │
│  └──────────────────────────────────────┘                    │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ /api/cron/   │ │ /api/cron/   │ │ /api/cron/   │        │
│  │ summary      │ │ news         │ │ engage       │        │
│  │ (週1)        │ │ (日1)        │ │ (3時間毎)    │         │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘        │
│         │                │                │                  │
│  ┌──────┴────────────────┴────────────────┴───────┐         │
│  │              Core Logic (src/lib/)               │         │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │         │
│  │  │ slack/  │  │ openai/  │  │ store/ (Redis)│  │         │
│  │  └────┬────┘  └────┬─────┘  └───────┬───────┘  │         │
│  └───────┼────────────┼────────────────┼──────────┘         │
│          │            │                │                     │
│  ┌───────┴──┐  ┌──────┴──────┐  ┌─────┴─────┐              │
│  │ Dashboard│  │             │  │           │              │
│  │ (React)  │  │             │  │           │              │
│  └──────────┘  │             │  │           │              │
└────────────────┼─────────────┼──┼───────────┼──────────────┘
                 │             │  │           │
                 ▼             │  │           ▼
          ┌──────────┐        │  │    ┌──────────────┐
          │ Slack    │        │  │    │ Upstash      │
          │ Web API  │        │  │    │ Redis        │
          └──────────┘        │  │    └──────────────┘
                              │  │
                              ▼  │
                 ┌─────────────────┐
                 │ OpenAI API      │
                 │ (GPT-5.2 +     │
                 │  web_search)    │
                 └─────────────────┘
```

---

## 13. 重要な技術的考慮事項

### 13.1 Slack 3秒タイムアウト対策

`@vercel/slack-bolt` の `waitUntil` 機能を活用。Slackへのack応答を即座に返し、重い処理（OpenAI API呼び出しなど）はバックグラウンドで実行する。

### 13.2 Slack API レート制限 (2025年以降)

- `conversations.history`: Marketplace外アプリは **1リクエスト/分**、`limit`パラメータ上限 **15件**
- 対策: Redisキャッシュで取得済みデータを保持し、差分のみ取得。イベント受信時にリアルタイムでキャッシュを更新。

### 13.3 OpenAI APIコスト最適化

- 要約には一度に送るコンテキストを制限（直近100-200メッセージ）
- `store: true` でセッション状態を保持し、キャッシュヒット率を上げる（40-80%コスト削減）
- 議論活性化の頻度を設定可能にし、API呼び出し回数を制御

### 13.4 メッセージイベントでのリアルタイムキャッシュ

`message.channels` / `message.groups` イベントを受信するたびに、そのメッセージをRedisにキャッシュ追加する。これにより `conversations.history` APIの呼び出し回数を最小限に抑える。

---

## 14. リサーチ出典

### Slack
- [Slack Bolt for JavaScript](https://github.com/slackapi/bolt-js)
- [Slack Bolt Reference](https://docs.slack.dev/tools/bolt-js/reference/)
- [conversations.history](https://docs.slack.dev/reference/methods/conversations.history/)
- [conversations.members](https://docs.slack.dev/reference/methods/conversations.members/)
- [reactions.add](https://docs.slack.dev/reference/methods/reactions.add/)
- [Slack Scopes](https://docs.slack.dev/reference/scopes/)

### Vercel
- [Vercel Slack Bolt Adapter](https://vercel.com/changelog/build-slack-agents-with-vercel-slack-bolt)
- [Slack Bolt with Next.js Template](https://vercel.com/templates/next.js/slack-bolt-with-next-js)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Cron Quickstart](https://vercel.com/docs/cron-jobs/quickstart)

### OpenAI
- [Introducing GPT-5](https://openai.com/index/introducing-gpt-5/)
- [Using GPT-5.2](https://platform.openai.com/docs/guides/latest-model)
- [Web Search Tool](https://platform.openai.com/docs/guides/tools-web-search)
- [Responses API](https://platform.openai.com/docs/api-reference/responses)
- [Migrate to Responses API](https://platform.openai.com/docs/guides/migrate-to-responses)

### データストア
- [Upstash Redis + Vercel Integration](https://upstash.com/docs/redis/howto/vercelintegration)
- [Upstash Vercel Functions Quickstart](https://upstash.com/docs/redis/quickstarts/vercel)
- [Vercel Marketplace - Upstash](https://vercel.com/marketplace/upstash)

### ニュースAPI (補助)
- [NewsAPI.org](https://newsapi.org/)
- [NewsData.io Free APIs](https://newsdata.io/blog/best-free-news-api/)
