import * as XLSX from "xlsx";
import { addDays } from "@/lib/board-date";
import type { ImportError, ParsedShiftEntry, ParsedStaff, ParseResult } from "./types";

// 設計書§1.2・§5.2の解析結果に基づく固定レイアウト。
// 4週間分が横方向に並び、週ブロックの列位置(G/AG/BG/CG)は固定値として
// 読み取る(ブロック間の非表示列は、そもそも読みに行かないことで読み飛ばす)。
const SHEET_NAME = "Sheet1 (2)";
const WEEK_START_COLS = ["G", "AG", "BG", "CG"].map((c) => XLSX.utils.decode_col(c));
const NAME_COL = XLSX.utils.decode_col("AN");
const DATE_ROW = 2; // Excel 3行目(日付の数字、0-indexed)
const STAFF_ROW_START = 5; // Excel 6行目
const STAFF_ROW_END = 13; // Excel 14行目

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/**
 * 勤務表(.xlsx)を解析する。
 * ファイル内の月見出し(2行目)は、月をまたぐ週で1ブロックにつき1つの値
 * しか持たず、週の途中で月が変わるケース(例: 8/31〜9/6の週)を一意に
 * 復元できないため、日付の組み立てには使わない。代わりに、献立表と
 * 同じ考え方(設計書§5.1で採用済み)で、対象期間の開始日(第1週の月曜日)
 * を呼び出し側から指定してもらい、そこからの日数計算で日付を確定する。
 * ファイル内の日付の数字(3行目)は、指定された開始日から計算した日付
 * とのクロスチェックにのみ使う(形式エラーの検出用)。
 */
export function parseShiftImport(buffer: Buffer, periodStartDate: string): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    // cellStyles: true を指定しないと、行の非表示状態(!rows[].hidden)が
    // 読み取られない(SheetJSの既定動作)。非表示行の職員を除外する
    // (設計書§5.2)ために必須。
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellStyles: true });
  } catch {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          column: "-",
          value: "-",
          message: "Excelファイルとして読み込めませんでした。ファイル形式を確認してください。",
        },
      ],
    };
  }

  const ws = workbook.Sheets[SHEET_NAME];
  if (!ws) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          column: "シート名",
          value: workbook.SheetNames.join(", "),
          message: `シート「${SHEET_NAME}」が見つかりません。テンプレートのシート名を変更しないでください。`,
        },
      ],
    };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const errors: ImportError[] = [];

  // 職員名(AN列)。非表示行(現在シフトに入っていない職員)は取り込まない
  // (設計書§5.2)。表示されている行のみ、上から順にsortOrderを振る。
  const staff: ParsedStaff[] = [];
  const staffRowIndexes: number[] = [];
  for (let r = STAFF_ROW_START; r <= STAFF_ROW_END; r++) {
    const hidden = ws["!rows"]?.[r]?.hidden === true;
    if (hidden) continue;
    const name = cellToString(rows[r]?.[NAME_COL]);
    if (!name) continue;
    staff.push({ name, sortOrder: staff.length + 1 });
    staffRowIndexes.push(r);
  }

  if (staff.length === 0) {
    errors.push({
      row: STAFF_ROW_START + 1,
      column: "職員名(AN列)",
      value: "-",
      message: "職員名を1件も読み取れませんでした。列位置(AN列)・行の表示状態を確認してください。",
    });
  }

  // 週ブロックごとに7日分の列位置と日付を確定し、3行目の日付数字と
  // クロスチェックする(形式エラーがあれば全体を中断)。
  const dateByCol = new Map<number, string>();
  for (let week = 0; week < 4; week++) {
    const startCol = WEEK_START_COLS[week];
    for (let day = 0; day < 7; day++) {
      const col = startCol + day;
      const date = addDays(periodStartDate, week * 7 + day);
      dateByCol.set(col, date);

      const cell = rows[DATE_ROW]?.[col];
      const cellNum = typeof cell === "number" ? cell : Number(cellToString(cell));
      const expectedDay = Number(date.split("-")[2]);
      if (!Number.isFinite(cellNum) || cellNum !== expectedDay) {
        errors.push({
          row: DATE_ROW + 1,
          column: `第${week + 1}週 ${day + 1}日目`,
          value: cellToString(cell),
          message: `指定した開始日(${periodStartDate})から計算した日付(${date})の日(${expectedDay})と、ファイル内の日付の数字(${cellToString(cell)})が一致しません。開始日の指定内容を確認してください。`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const entries: ParsedShiftEntry[] = [];
  for (const rowIndex of staffRowIndexes) {
    const name = cellToString(rows[rowIndex]?.[NAME_COL]);
    for (const [col, date] of dateByCol) {
      const code = cellToString(rows[rowIndex]?.[col]);
      if (!code) continue; // 記号なし(未定・休みの明記なし)は取り込まない
      entries.push({ date, staffName: name, code });
    }
  }

  return { ok: true, staff, entries };
}
