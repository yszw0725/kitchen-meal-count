"use client";

import { useState } from "react";
import { formatDateLabel } from "@/lib/board-date";

type ImportError = { row: number; column: string; value: string; message: string };
type ParsedStaff = { name: string; sortOrder: number };
type ParsedShiftEntry = { date: string; staffName: string; code: string };
type ParsedDateEvent = { date: string; note: string };

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
      staff: ParsedStaff[];
      entries: ParsedShiftEntry[];
      dateEvents: ParsedDateEvent[];
    }
  | { phase: "confirming" }
  | { phase: "done"; staffCount: number; entryCount: number; dateEventCount: number };

export default function ShiftImportClient() {
  const [stage, setStage] = useState<Stage>({ phase: "idle" });
  const [periodStartDate, setPeriodStartDate] = useState("");

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !periodStartDate) return;

    setStage({ phase: "uploading" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("periodStartDate", periodStartDate);

    const res = await fetch("/api/shift-import/upload", { method: "POST", body: formData });
    const body = await res.json();

    if (!res.ok) {
      setStage({
        phase: "error",
        errors: body.errors ?? [
          { row: 0, column: "-", value: "-", message: body.message ?? "アップロードに失敗しました。" },
        ],
      });
      return;
    }

    setStage({
      phase: "preview",
      storagePath: body.storagePath,
      originalFilename: body.originalFilename,
      startDate: body.startDate,
      endDate: body.endDate,
      staff: body.staff,
      entries: body.entries,
      dateEvents: body.dateEvents,
    });
  }

  async function handleConfirm() {
    if (stage.phase !== "preview") return;
    setStage({ phase: "confirming" });

    const res = await fetch("/api/shift-import/confirm", {
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
        errors: body.errors ?? [
          { row: 0, column: "-", value: "-", message: body.message ?? "確定に失敗しました。" },
        ],
      });
      return;
    }

    setStage({
      phase: "done",
      staffCount: body.staffCount,
      entryCount: body.entryCount,
      dateEventCount: body.dateEventCount,
    });
  }

  function reset() {
    setStage({ phase: "idle" });
  }

  return (
    <div className="space-y-6">
      {(stage.phase === "idle" || stage.phase === "uploading" || stage.phase === "error") && (
        <form onSubmit={handleUpload} className="space-y-4 rounded-lg border border-zinc-200 p-4">
          <div>
            <label htmlFor="periodStartDate" className="block text-sm font-medium text-zinc-700">
              対象期間の開始日(第1週の月曜日)
            </label>
            <input
              id="periodStartDate"
              type="date"
              required
              value={periodStartDate}
              onChange={(e) => setPeriodStartDate(e.target.value)}
              className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {periodStartDate && new Date(periodStartDate).getDay() !== 1 && (
              <p className="mt-1 text-xs text-amber-600">
                指定した日付は月曜日ではありません。勤務表は4週間・月曜始まりのため、開始日をご確認ください。
              </p>
            )}
          </div>
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-zinc-700">
              勤務表ファイル (.xlsx)
            </label>
            <input id="file" name="file" type="file" accept=".xlsx" required className="mt-1 block text-sm" />
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
              {formatDateLabel(stage.startDate)} 〜 {formatDateLabel(stage.endDate)} の勤務表を、
              職員{stage.staff.length}名・勤務{stage.entries.length}件読み取りました。内容を確認し、
              問題なければ確定してください。確定すると、この期間の既存の勤務データは置き換わります。
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="p-2 text-left font-medium text-zinc-600">職員名</th>
                  <th className="p-2 text-left font-medium text-zinc-600">勤務件数</th>
                </tr>
              </thead>
              <tbody>
                {stage.staff.map((s) => (
                  <tr key={s.name} className="border-b border-zinc-100">
                    <td className="p-2 text-zinc-800">{s.name}</td>
                    <td className="p-2 text-zinc-500">
                      {stage.entries.filter((e) => e.staffName === s.name).length}件
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stage.dateEvents.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-zinc-700">
                日付に紐づく会議・行事({stage.dateEvents.length}件)
              </p>
              <ul className="space-y-1 text-sm text-zinc-600">
                {stage.dateEvents.map((e) => (
                  <li key={e.date}>
                    {formatDateLabel(e.date)}: {e.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={reset} className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
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
          <p className="text-emerald-800">
            勤務表(職員{stage.staffCount}名・勤務{stage.entryCount}件・会議日程
            {stage.dateEventCount}件)を確定しました。
          </p>
          <button onClick={reset} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm">
            続けて別の期間をアップロードする
          </button>
        </div>
      )}
    </div>
  );
}
