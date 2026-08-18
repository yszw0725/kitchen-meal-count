import * as XLSX from "xlsx";
import { addDays } from "@/lib/board-date";
import type { MealType } from "@/lib/board-types";
import type { ImportError, ParsedMenuItem, ParseResult } from "./types";

// 設計書§1.1の解析結果に基づく固定レイアウト。
// 7日分が横方向に並び、各日は6列分を使用する。
const SHEET_NAME = "Page1";
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
// 月=C列(2)〜, 火=I列(8)〜, 水=O列(14)〜, 木=U列(20)〜,
// 金=AA列(26)〜, 土=AG列(32)〜, 日=AM列(38)〜 (各6列分、0-indexed)
const DAY_COLUMN_START = [2, 8, 14, 20, 26, 32, 38];
const DATE_HEADER_ROW = 4; // Excel 5行目 (0-indexed)

const MEAL_BLOCKS: Array<{ meal: MealType; label: string; nameRowStart: number; nameRowEnd: number }> = [
  { meal: "breakfast", label: "朝", nameRowStart: 5, nameRowEnd: 10 }, // Excel 6〜11行
  { meal: "lunch", label: "昼", nameRowStart: 14, nameRowEnd: 19 }, // Excel 15〜20行
  { meal: "dinner", label: "夕", nameRowStart: 23, nameRowEnd: 28 }, // Excel 24〜29行
];

// Excelの日付書式によっては、1桁の日が右詰め用の空白でパディングされる
// (例: "9月 1日")。月・日の直後に空白が入るケースを許容する。
const DATE_HEADER_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
}

/**
 * 週間献立表(.xls)を解析する。
 * ファイル内に年の情報が無いため、対象週の開始日(月曜日、ISO yyyy-mm-dd)を
 * 呼び出し側から指定する(設計書§5.1)。ファイル内の日付見出し(例: 8月24日)
 * は、指定された開始日から計算した日付とのクロスチェックにのみ使う。
 */
export function parseMenuImport(buffer: Buffer, weekStartDate: string): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
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

  if (!workbook.Sheets[SHEET_NAME]) {
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

  const rows = sheetRows(workbook, SHEET_NAME);
  const errors: ImportError[] = [];
  const items: ParsedMenuItem[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayLabel = DAY_LABELS[dayIndex];
    const colStart = DAY_COLUMN_START[dayIndex];
    const date = addDays(weekStartDate, dayIndex);

    // 日付見出しのクロスチェック(年はファイルに無いため、指定された開始日側を正とする)
    const headerCell = cellToString(rows[DATE_HEADER_ROW]?.[colStart]).trim();
    const match = headerCell.match(DATE_HEADER_RE);
    if (!match) {
      errors.push({
        row: DATE_HEADER_ROW + 1,
        column: `${dayLabel}曜日の日付見出し`,
        value: headerCell,
        message: "日付見出しの形式が想定と異なります(例: 8月24日(月曜日))。",
      });
    } else {
      const [, mm, dd] = match;
      const [, expectedMonth, expectedDay] = date.split("-").map(Number);
      if (Number(mm) !== expectedMonth || Number(dd) !== expectedDay) {
        errors.push({
          row: DATE_HEADER_ROW + 1,
          column: `${dayLabel}曜日の日付見出し`,
          value: headerCell,
          message: `指定した開始日(${weekStartDate})から計算した日付(${date})と、ファイル内の日付見出し(${mm}月${dd}日)が一致しません。開始日の指定内容を確認してください。`,
        });
      }
    }

    for (const block of MEAL_BLOCKS) {
      let sortOrder = 0;
      for (let r = block.nameRowStart; r <= block.nameRowEnd; r++) {
        const dishName = cellToString(rows[r]?.[colStart]).trim();
        if (!dishName) break; // 空行で終端(設計書§1.1)
        sortOrder += 1;
        items.push({ date, meal: block.meal, sortOrder, dishName });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, items };
}
