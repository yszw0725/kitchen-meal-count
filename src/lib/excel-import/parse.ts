import * as XLSX from "xlsx";
import type {
  ImportError,
  ParsedDailyExtra,
  ParsedMealException,
  ParsedResident,
  ParseResult,
  MealType,
  ExceptionType,
} from "./types";

// 設計書§0.3のシートA/B/C。プレビュー・月次集計・区分マスタ・使い方・内部計算は読み飛ばす。
const SHEET_MEAL_RECORDS = "食数記録";
const SHEET_DAILY_EXTRAS = "職員食来客記録";
const SHEET_ROSTER = "利用者名簿";

const MEAL_LABELS: Record<string, MealType> = {
  朝: "breakfast",
  昼: "lunch",
  夕: "dinner",
};

const EXCEPTION_LABELS: Record<string, ExceptionType> = {
  欠食: "absent",
  臨時喫食: "present",
};

const ENROLLMENT_LABELS: Record<string, boolean> = {
  在籍: true,
  退所: false,
};

const MEAL_FORM_COLUMNS: Array<{ index: number; code: string; label: string }> = [
  { index: 2, code: "kizami", label: "刻み食" },
  { index: 3, code: "diet", label: "ダイエット食" },
  { index: 4, code: "araimiji", label: "粗みじん食" },
  { index: 5, code: "chomiji", label: "超みじん食" },
];

const DATE_STRING_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

function isRowEmpty(row: unknown[], columns: number[]): boolean {
  return columns.every((c) => row[c] === null || row[c] === undefined || row[c] === "");
}

function parseDateCell(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const m = value.trim().match(DATE_STRING_RE);
    if (m) {
      const [, y, mo, d] = m;
      const date = new Date(Number(y), Number(mo) - 1, Number(d));
      if (
        date.getFullYear() === Number(y) &&
        date.getMonth() === Number(mo) - 1 &&
        date.getDate() === Number(d)
      ) {
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
  }
  return null;
}

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

export function parseExcelImport(
  buffer: Buffer,
  knownGroupNames: string[],
  existingResidentNames: string[],
): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return {
      ok: false,
      errors: [
        {
          sheet: "(ファイル全体)",
          row: 0,
          column: "-",
          value: "-",
          message: "Excelファイルとして読み込めませんでした。ファイル形式を確認してください。",
        },
      ],
    };
  }

  const errors: ImportError[] = [];

  for (const required of [SHEET_MEAL_RECORDS, SHEET_DAILY_EXTRAS, SHEET_ROSTER]) {
    if (!workbook.Sheets[required]) {
      errors.push({
        sheet: required,
        row: 0,
        column: "-",
        value: "-",
        message: `シート「${required}」が見つかりません。テンプレートのシート名を変更しないでください。`,
      });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // ---------------------------------------------------------------------
  // 利用者名簿 (先にパースし、食数記録の利用者名クロスチェックに使う)
  // ---------------------------------------------------------------------
  const residents: ParsedResident[] = [];
  const rosterRows = sheetRows(workbook, SHEET_ROSTER);
  for (let i = 1; i < rosterRows.length; i++) {
    const row = rosterRows[i];
    const excelRow = i + 1;
    if (isRowEmpty(row, [0, 1, 6])) continue;

    const name = cellToString(row[0]).trim();
    const groupName = cellToString(row[1]).trim();
    const enrollmentLabel = cellToString(row[6]).trim();

    if (!name) {
      errors.push({
        sheet: SHEET_ROSTER,
        row: excelRow,
        column: "氏名",
        value: cellToString(row[0]),
        message: "氏名が入力されていません。",
      });
    }
    if (!groupName || !knownGroupNames.includes(groupName)) {
      errors.push({
        sheet: SHEET_ROSTER,
        row: excelRow,
        column: "区分",
        value: cellToString(row[1]),
        message: `区分は次のいずれかを選択してください: ${knownGroupNames.join(" / ")}`,
      });
    }
    if (!(enrollmentLabel in ENROLLMENT_LABELS)) {
      errors.push({
        sheet: SHEET_ROSTER,
        row: excelRow,
        column: "在籍状態",
        value: cellToString(row[6]),
        message: "在籍状態は「在籍」または「退所」を選択してください。",
      });
    }

    if (name && groupName && knownGroupNames.includes(groupName) && enrollmentLabel in ENROLLMENT_LABELS) {
      const mealForm = MEAL_FORM_COLUMNS.filter((c) => {
        const v = row[c.index];
        return v !== null && v !== undefined && String(v).trim() !== "";
      }).map((c) => c.code);

      residents.push({
        name,
        groupName,
        mealForm,
        enrolled: ENROLLMENT_LABELS[enrollmentLabel],
        note: cellToString(row[7]).trim() || null,
      });
    }
  }

  // 名簿内の氏名重複チェック
  const seenNames = new Map<string, number>();
  for (let i = 0; i < residents.length; i++) {
    const r = residents[i];
    if (seenNames.has(r.name)) {
      errors.push({
        sheet: SHEET_ROSTER,
        row: 0,
        column: "氏名",
        value: r.name,
        message: `氏名「${r.name}」が名簿内に複数回登場しています。1名につき1行にしてください。`,
      });
    }
    seenNames.set(r.name, i);
  }

  const validResidentNames = new Set<string>([
    ...existingResidentNames,
    ...residents.map((r) => r.name),
  ]);

  // ---------------------------------------------------------------------
  // 食数記録
  // ---------------------------------------------------------------------
  const mealExceptions: ParsedMealException[] = [];
  const mealRows = sheetRows(workbook, SHEET_MEAL_RECORDS);
  const seenExceptionKeys = new Map<string, number>();

  for (let i = 1; i < mealRows.length; i++) {
    const row = mealRows[i];
    const excelRow = i + 1;
    if (isRowEmpty(row, [0, 1, 2, 3])) continue;

    const date = parseDateCell(row[0]);
    const mealLabel = cellToString(row[1]).trim();
    const residentName = cellToString(row[2]).trim();
    const typeLabel = cellToString(row[3]).trim();
    const note = cellToString(row[4]).trim() || null;

    if (!date) {
      errors.push({
        sheet: SHEET_MEAL_RECORDS,
        row: excelRow,
        column: "日付",
        value: cellToString(row[0]),
        message: "日付の形式が不正です (例: 2026/08/13)。",
      });
    }
    if (!(mealLabel in MEAL_LABELS)) {
      errors.push({
        sheet: SHEET_MEAL_RECORDS,
        row: excelRow,
        column: "食事",
        value: cellToString(row[1]),
        message: "食事は「朝」「昼」「夕」のいずれかを選択してください。",
      });
    }
    if (!residentName) {
      errors.push({
        sheet: SHEET_MEAL_RECORDS,
        row: excelRow,
        column: "利用者",
        value: cellToString(row[2]),
        message: "利用者が入力されていません。",
      });
    } else if (!validResidentNames.has(residentName)) {
      errors.push({
        sheet: SHEET_MEAL_RECORDS,
        row: excelRow,
        column: "利用者",
        value: residentName,
        message: "利用者名簿に存在しない利用者名です。名簿シートを確認してください。",
      });
    }
    if (!(typeLabel in EXCEPTION_LABELS)) {
      errors.push({
        sheet: SHEET_MEAL_RECORDS,
        row: excelRow,
        column: "種別",
        value: cellToString(row[3]),
        message: "種別は「欠食」または「臨時喫食」を選択してください。",
      });
    }

    if (date && mealLabel in MEAL_LABELS && residentName && validResidentNames.has(residentName) && typeLabel in EXCEPTION_LABELS) {
      const key = `${residentName}::${date}::${mealLabel}`;
      if (seenExceptionKeys.has(key)) {
        errors.push({
          sheet: SHEET_MEAL_RECORDS,
          row: excelRow,
          column: "利用者/日付/食事",
          value: `${residentName} / ${date} / ${mealLabel}`,
          message: `同じ利用者・日付・食事の組み合わせが行${seenExceptionKeys.get(key)}と重複しています。`,
        });
        continue;
      }
      seenExceptionKeys.set(key, excelRow);

      mealExceptions.push({
        residentName,
        date,
        meal: MEAL_LABELS[mealLabel],
        type: EXCEPTION_LABELS[typeLabel],
        note,
      });
    }
  }

  // ---------------------------------------------------------------------
  // 職員食来客記録 (日付×食事の重複は最終行優先 §0.3)
  // ---------------------------------------------------------------------
  const dailyExtrasByKey = new Map<string, ParsedDailyExtra>();
  const extraRows = sheetRows(workbook, SHEET_DAILY_EXTRAS);

  for (let i = 1; i < extraRows.length; i++) {
    const row = extraRows[i];
    const excelRow = i + 1;
    if (isRowEmpty(row, [0, 1, 2, 3])) continue;

    const date = parseDateCell(row[0]);
    const mealLabel = cellToString(row[1]).trim();
    const staffRaw = row[2];
    const visitorRaw = row[3];

    if (!date) {
      errors.push({
        sheet: SHEET_DAILY_EXTRAS,
        row: excelRow,
        column: "日付",
        value: cellToString(row[0]),
        message: "日付の形式が不正です (例: 2026/08/13)。",
      });
    }
    if (!(mealLabel in MEAL_LABELS)) {
      errors.push({
        sheet: SHEET_DAILY_EXTRAS,
        row: excelRow,
        column: "食事",
        value: cellToString(row[1]),
        message: "食事は「朝」「昼」「夕」のいずれかを選択してください。",
      });
    }

    const staffCount = Number(staffRaw);
    if (staffRaw === null || staffRaw === "" || !Number.isInteger(staffCount) || staffCount < 0) {
      errors.push({
        sheet: SHEET_DAILY_EXTRAS,
        row: excelRow,
        column: "職員食数",
        value: cellToString(staffRaw),
        message: "職員食数は0以上の整数で入力してください。",
      });
    }

    const visitorCount = Number(visitorRaw);
    if (visitorRaw === null || visitorRaw === "" || !Number.isInteger(visitorCount) || visitorCount < 0) {
      errors.push({
        sheet: SHEET_DAILY_EXTRAS,
        row: excelRow,
        column: "来客数",
        value: cellToString(visitorRaw),
        message: "来客数は0以上の整数で入力してください。",
      });
    }

    if (
      date &&
      mealLabel in MEAL_LABELS &&
      Number.isInteger(staffCount) &&
      staffCount >= 0 &&
      Number.isInteger(visitorCount) &&
      visitorCount >= 0
    ) {
      const key = `${date}::${mealLabel}`;
      dailyExtrasByKey.set(key, {
        date,
        meal: MEAL_LABELS[mealLabel],
        staffCount,
        visitorCount,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    mealExceptions,
    dailyExtras: [...dailyExtrasByKey.values()],
    residents,
  };
}
