"use client";

import { useState, useEffect, useCallback } from "react";
import { ChannelConfig } from "@/types/config";

interface ChannelWithMeta extends ChannelConfig {
  summaryCount: number;
  lastSummary: string | null;
}

export default function DashboardPage() {
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  // Check if already logged in (cookie exists)
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch("/api/dashboard/login");
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        fetchChannels();
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/channels");
      if (res.status === 401) {
        setAuthenticated(false);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const data = await res.json();
      setChannels(data.channels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "ログインに失敗しました");
      }

      setAuthenticated(true);
      setPassword("");
      fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/dashboard/login", { method: "DELETE" });
    setAuthenticated(false);
    setChannels([]);
  };

  const toggleChannel = async (channelId: string, enabled: boolean) => {
    await fetch("/api/dashboard/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, enabled }),
    });
    fetchChannels();
  };

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-bold mb-6 text-center">
            ダッシュボードログイン
          </h2>
          <form onSubmit={handleLogin}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4"
              placeholder="パスワードを入力"
            />
            {error && (
              <p className="text-red-600 text-sm mb-4">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {loading ? "読み込み中..." : "ログイン"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">チャンネル管理</h2>
          <p className="text-gray-600 mt-1">
            {channels.length} チャンネルが設定されています
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchChannels}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            更新
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm text-gray-500"
          >
            ログアウト
          </button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-lg">
            まだチャンネルが設定されていません。
          </p>
          <p className="text-gray-400 mt-2">
            Slackで <code className="bg-gray-100 px-2 py-1 rounded">/discuss-config</code> を実行して開始してください。
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {channels.map((channel) => (
            <div
              key={channel.channelId}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">
                      #{channel.channelName}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        channel.enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {channel.enabled ? "有効" : "無効"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    モデル: {channel.model}
                  </p>
                </div>
                <button
                  onClick={() =>
                    toggleChannel(channel.channelId, !channel.enabled)
                  }
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    channel.enabled
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                >
                  {channel.enabled ? "無効化" : "有効化"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <StatusCard
                  label="定期要約"
                  enabled={channel.summary.enabled}
                  detail={`${channel.summary.schedule} / ${channel.summaryCount}件の履歴`}
                />
                <StatusCard
                  label="ニュース配信"
                  enabled={channel.news.enabled}
                  detail={
                    channel.news.themes.length > 0
                      ? channel.news.themes.join(", ")
                      : "テーマ未設定"
                  }
                />
                <StatusCard
                  label="議論活性化"
                  enabled={channel.engagement.enabled}
                  detail={`反応:${channel.engagement.reactionFrequency} / 深掘り:${channel.engagement.deepDiveFrequency}`}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  プロンプト: {channel.systemPrompt.slice(0, 100)}
                  {channel.systemPrompt.length > 100 ? "..." : ""}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  最終要約:{" "}
                  {channel.lastSummary
                    ? new Date(channel.lastSummary).toLocaleString("ja-JP")
                    : "なし"}
                  {" | "}更新:{" "}
                  {new Date(channel.updatedAt).toLocaleString("ja-JP")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  label,
  enabled,
  detail,
}: {
  label: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            enabled ? "bg-green-500" : "bg-gray-300"
          }`}
        />
        <span className="text-sm font-medium text-gray-700">{label}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}
