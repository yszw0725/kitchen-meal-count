export default function OfflineBanner({
  message = "オフラインです。表示は最後に取得した内容のままです。通信が復旧すると自動的に最新の状態に戻ります。",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800"
    >
      ● オフライン — {message}
    </div>
  );
}
