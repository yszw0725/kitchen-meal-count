"use client";

import { useState } from "react";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";

type ImportError = {
  sheet: string;
  row: number;
  column: string;
  value: string;
  message: string;
};

type KitchenOverrideConflict = {
  id: string;
  residentName: string;
  meal: "breakfast" | "lunch" | "dinner";
  type: "absent" | "present";
  createdAt: string;
};

type DiffSummary = {
  rosterDiff: {
    newResidents: { name: string; groupName: string }[];
    statusChanges: { name: string; from: string; to: string }[];
  };
  kitchenOverrideConflicts: KitchenOverrideConflict[];
  mealExceptionCount: number;
  dailyExtraCount: number;
  mealExceptionDates: string[];
};

type Stage =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "error"; errors: ImportError[] }
  | { phase: "review"; batchId: string; diffSummary: DiffSummary }
  | { phase: "confirming"; batchId: string; diffSummary: DiffSummary }
  | { phase: "done"; result: Record<string, number> };

const MEAL_LABEL: Record<string, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夕",
};

const TYPE_LABEL: Record<string, string> = {
  absent: "欠食",
  present: "臨時喫食",
};

export default function ExcelImportClient() {
  const [stage, setStage] = useState<Stage>({ phase: "idle" });
  const [resolutions, setResolutions] = useState<Record<string, "kept" | "overwritten">>({});
  const online = useOnlineStatus();

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    setStage({ phase: "uploading" });
    setResolutions({});

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/excel-import/upload", {
      method: "POST",
      body: formData,
    });
    const body = await res.json();

    if (!res.ok) {
      setStage({ phase: "error", errors: body.errors ?? [{ sheet: "-", row: 0, column: "-", value: "-", message: body.message ?? "アップロードに失敗しました。" }] });
      return;
    }

    setStage({ phase: "review", batchId: body.batchId, diffSummary: body.diffSummary });
  }

  async function handleConfirm() {
    if (stage.phase !== "review" || !online) return;
    setStage({ phase: "confirming", batchId: stage.batchId, diffSummary: stage.diffSummary });

    const res = await fetch(`/api/excel-import/${stage.batchId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutions }),
    });
    const body = await res.json();

    if (!res.ok) {
      setStage({ phase: "error", errors: body.errors ?? [{ sheet: "-", row: 0, column: "-", value: "-", message: body.message ?? "反映に失敗しました。" }] });
      return;
    }

    setStage({ phase: "done", result: body.result });
  }

  async function handleCancel() {
    if (stage.phase !== "review" || !online) return;
    await fetch(`/api/excel-import/${stage.batchId}/cancel`, { method: "POST" });
    setStage({ phase: "idle" });
  }

  return (
    <div className="space-y-6">
      {!online && <OfflineBanner message="オフラインのためExcel取込は操作できません。" />}
      {(stage.phase === "idle" || stage.phase === "uploading") && (
        <form onSubmit={handleUpload} className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700">
            Excelファイル (.xlsx)
          </label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="block w-full text-sm text-zinc-700"
          />
          <button
            type="submit"
            disabled={stage.phase === "uploading" || !online}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {stage.phase === "uploading" ? "アップロード中..." : "アップロード"}
          </button>
        </form>
      )}

      {stage.phase === "error" && (
        <div className="space-y-3">
          <p className="font-medium text-red-700">
            取り込みを中断しました。以下のエラーを修正して再アップロードしてください。
          </p>
          <div className="overflow-x-auto rounded-md border border-red-200">
            <table className="min-w-full text-sm">
              <thead className="bg-red-50 text-left text-red-900">
                <tr>
                  <th className="px-3 py-2">シート</th>
                  <th className="px-3 py-2">行</th>
                  <th className="px-3 py-2">列</th>
                  <th className="px-3 py-2">入力値</th>
                  <th className="px-3 py-2">内容</th>
                </tr>
              </thead>
              <tbody>
                {stage.errors.map((e, i) => (
                  <tr key={i} className="border-t border-red-100">
                    <td className="px-3 py-2">{e.sheet}</td>
                    <td className="px-3 py-2">{e.row || "-"}</td>
                    <td className="px-3 py-2">{e.column}</td>
                    <td className="px-3 py-2 font-mono">{e.value}</td>
                    <td className="px-3 py-2">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => setStage({ phase: "idle" })}
            className="rounded-md border border-zinc-300 px-4 py-2"
          >
            やり直す
          </button>
        </div>
      )}

      {(stage.phase === "review" || stage.phase === "confirming") && (
        <div className="space-y-6">
          <div className="rounded-md border border-zinc-200 p-4">
            <p className="text-sm text-zinc-600">
              欠食・臨時喫食 {stage.diffSummary.mealExceptionCount}件 / 職員来客記録{" "}
              {stage.diffSummary.dailyExtraCount}件 を反映します。
            </p>
          </div>

          {stage.diffSummary.rosterDiff.newResidents.length > 0 && (
            <div>
              <h3 className="font-medium text-zinc-900">新規追加される利用者</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-zinc-700">
                {stage.diffSummary.rosterDiff.newResidents.map((r) => (
                  <li key={r.name}>
                    {r.name}（{r.groupName}）
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stage.diffSummary.rosterDiff.statusChanges.length > 0 && (
            <div>
              <h3 className="font-medium text-zinc-900">在籍状態の変更</h3>
              <ul className="mt-1 list-inside list-disc text-sm text-zinc-700">
                {stage.diffSummary.rosterDiff.statusChanges.map((c) => (
                  <li key={c.name}>
                    {c.name}: {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stage.diffSummary.kitchenOverrideConflicts.length > 0 && (
            <div>
              <h3 className="font-medium text-zinc-900">
                厨房による当日の緊急入力との競合 ({stage.diffSummary.kitchenOverrideConflicts.length}件)
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                各項目について、Excelの内容で置き換えるか・このまま残すかを選択してください（未選択の場合は「残す」を適用します）。
              </p>
              <div className="mt-2 space-y-2">
                {stage.diffSummary.kitchenOverrideConflicts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <span>
                      {c.residentName} / {MEAL_LABEL[c.meal]} / 厨房入力: {TYPE_LABEL[c.type]}
                    </span>
                    <span className="flex gap-3">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`resolution-${c.id}`}
                          checked={(resolutions[c.id] ?? "kept") === "kept"}
                          onChange={() =>
                            setResolutions((prev) => ({ ...prev, [c.id]: "kept" }))
                          }
                        />
                        このまま残す
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`resolution-${c.id}`}
                          checked={resolutions[c.id] === "overwritten"}
                          onChange={() =>
                            setResolutions((prev) => ({ ...prev, [c.id]: "overwritten" }))
                          }
                        />
                        Excelの内容で置き換える
                      </label>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={stage.phase === "confirming" || !online}
              className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {stage.phase === "confirming" ? "反映中..." : "この内容で反映する"}
            </button>
            <button
              onClick={handleCancel}
              disabled={stage.phase === "confirming" || !online}
              className="rounded-md border border-zinc-300 px-4 py-2 disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {stage.phase === "done" && (
        <div className="space-y-3">
          <p className="font-medium text-green-700">反映が完了しました。</p>
          <ul className="text-sm text-zinc-700">
            <li>新規利用者: {stage.result.newResidents}件</li>
            <li>利用者情報更新: {stage.result.updatedResidents}件</li>
            <li>欠食・臨時喫食: {stage.result.mealExceptions}件</li>
            <li>職員来客記録: {stage.result.dailyExtras}件</li>
            <li>厨房緊急入力の解決: {stage.result.kitchenOverridesResolved}件</li>
          </ul>
          <button
            onClick={() => setStage({ phase: "idle" })}
            className="rounded-md border border-zinc-300 px-4 py-2"
          >
            続けてアップロードする
          </button>
        </div>
      )}
    </div>
  );
}
