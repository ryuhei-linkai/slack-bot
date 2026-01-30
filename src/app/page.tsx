export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Discussion Bot</h1>
      <p className="text-gray-600 mb-8">
        AI-powered Slack bot that activates channel discussions.
      </p>
      <a
        href="/dashboard"
        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
      >
        管理ダッシュボードへ
      </a>
    </main>
  );
}
