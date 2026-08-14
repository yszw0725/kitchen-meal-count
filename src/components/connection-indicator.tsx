export default function ConnectionIndicator({
  online,
  lastUpdated,
}: {
  online: boolean;
  lastUpdated: Date;
}) {
  const hh = String(lastUpdated.getHours()).padStart(2, "0");
  const mm = String(lastUpdated.getMinutes()).padStart(2, "0");

  return (
    <div className="fixed right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/95 px-3 py-1.5 text-xs text-zinc-600 shadow">
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-zinc-400"}`}
      />
      {online ? "オンライン" : "オフライン"}（最終更新 {hh}:{mm}）
    </div>
  );
}
