"use client";

import { useState } from "react";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { formatDateLabel } from "@/lib/board-date";

type ImportError = { row: number; column: string; value: string; message: string };
type ParsedMenuItem = { date: string; meal: MealType; sortOrder: number; dishName: string };

type Stage =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "error"; errors: ImportError[] }
  | {
      phase: "preview";
      storagePath: string;
      originalFilename: string;
      startDate: string;
      endDate: string;
      items: ParsedMenuItem[];
    }
  | { phase: "confirming" }
  | { phase: "done"; itemCount: number };

function groupItemsByDate(items: ParsedMenuItem[]): Map<string, ParsedMenuItem[]> {
  const map = new Map<string, ParsedMenuItem[]>();
  for (const item of items) {
    const list = map.get(item.date) ?? [];
    list.push(item);
    map.set(item.date, list);
  }
  return map;
}

export default function MenuImportClient() {
  const [stage, setStage] = useState<Stage>({ phase: "idle" });
  const [weekStartDate, setWeekStartDate] = useState("");

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !weekStartDate) return;

    setStage({ phase: "uploading" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("weekStartDate", weekStartDate);

    const res = await fetch("/api/menu-import/upload", { method: "POST", body: formData });
    const body = await res.json();

    if (!res.ok) {
      setStage({
        phase: "error",
        errors: body.errors ?? [{ row: 0, column: "-", value: "-", message: body.message ?? "アップロードに失敗しました。" }],
      });
      return;
    }

    setStage({
      phase: "preview",
      storagePath: body.storagePath,
      originalFilename: body.originalFilename,
      startDate: body.startDate,
      endDate: body.endDate,
      items: body.items,
    });
  }

  async function handleConfirm() {
    if (stage.phase !== "preview") return;
    setStage({ phase: "confirming" });

    const res = await fetch("/api/menu-import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath: stage.storagePath,
        originalFilename: stage.originalFilename,
        startDate: stage.startDate,
      }),
    });
    const body = await res.json();

    if (!res.ok) {
      setStage({
        phase: "error",
        errors: body.errors ?? [{ row: 0, column: "-", value: "-", message: body.message ?? "確定に失敗しました。" }],
      });
      return;
    }

    setStage({ phase: "done", itemCount: body.itemCount });
  }

  function reset() {
    setStage({ phase: "idle" });
  }

  return (
    <div className="space-y-6">
      {(stage.phase === "idle" || stage.phase === "uploading" || stage.phase === "error") && (
        <form onSubmit={handleUpload} className="space-y-4 rounded-lg border border-zinc-200 p-4">
          <div>
            <label htmlFor="weekStartDate" className="block text-sm font-medium text-zinc-700">
              対象週の開始日(月曜日)
            </label>
            <input
              id="weekStartDate"
              type="date"
              required
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {weekStartDate && new Date(weekStartDate).getDay() !== 1 && (
              <p className="mt-1 text-xs text-amber-600">
                指定した日付は月曜日ではありません。献立表は月曜始まりのため、開始日をご確認ください。
              </p>
            )}
          </div>
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-zinc-700">
              献立表ファイル (.xls)
            </label>
            <input id="file" name="file" type="file" accept=".xls" required className="mt-1 block text-sm" />
          </div>
          <button
            type="submit"
            disabled={stage.phase === "uploading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {stage.phase === "uploading" ? "アップロード中..." : "アップロード"}
          </button>
        </form>
      )}

      {stage.phase === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">取り込みに失敗しました。</p>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {stage.errors.map((e, i) => (
              <li key={i}>
                {e.row > 0 ? `${e.row}行目 ` : ""}
                {e.column !== "-" ? `[${e.column}] ` : ""}
                {e.message}
                {e.value !== "-" && e.value ? `(入力値: ${e.value})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.phase === "preview" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-600">
              {formatDateLabel(stage.startDate)} 〜 {formatDateLabel(stage.endDate)} の献立を
              {stage.items.length}件読み取りました。内容を確認し、問題なければ確定してください。
              確定すると、この期間の既存の献立データは置き換わります。
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <tbody>
                {[...groupItemsByDate(stage.items).entries()].map(([date, items]) => (
                  <tr key={date} className="border-b border-zinc-100 align-top">
                    <td className="whitespace-nowrap p-2 font-medium text-zinc-700">
                      {formatDateLabel(date)}
                    </td>
                    <td className="p-2">
                      {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
                        const mealItems = items.filter((i) => i.meal === meal);
                        if (mealItems.length === 0) return null;
                        return (
                          <p key={meal}>
                            <span className="font-medium">【{MEAL_LABEL[meal]}】</span>{" "}
                            {mealItems.map((i) => i.dishName).join("、")}
                          </p>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
            >
              やり直す
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              この内容で確定する
            </button>
          </div>
        </div>
      )}

      {stage.phase === "confirming" && <p className="text-sm text-zinc-500">確定処理中...</p>}

      {stage.phase === "done" && (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-emerald-800">献立({stage.itemCount}件)を確定しました。</p>
          <button
            onClick={reset}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm"
          >
            続けて別の週をアップロードする
          </button>
        </div>
      )}
    </div>
  );
}
