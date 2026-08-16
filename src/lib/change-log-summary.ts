import { MEAL_LABEL, type MealType } from "@/lib/board-types";

export type ChangeLogRow = {
  id: number;
  actor_id: string | null;
  table_name: string;
  record_pk: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  summary: string | null;
  created_at: string;
};

export type ChangeLogContext = {
  residentNames: Record<string, string>;
  groupNames: Record<string, string>;
  actorNames: Record<string, string>;
};

export type ChangeLogOrigin = "excel" | "kitchen" | "manual" | "system";

export function classifyOrigin(row: ChangeLogRow): ChangeLogOrigin {
  if (row.table_name === "count_overrides") return "manual";
  if (row.actor_id === null) return "excel";
  if (row.table_name === "kitchen_overrides") return "kitchen";
  return "system";
}

const ORIGIN_LABEL: Record<ChangeLogOrigin, string> = {
  excel: "Excel取込",
  kitchen: "厨房緊急入力",
  manual: "手動修正",
  system: "システム",
};

export function originLabel(origin: ChangeLogOrigin): string {
  return ORIGIN_LABEL[origin];
}

function meal(m: unknown): string {
  return MEAL_LABEL[m as MealType] ?? String(m);
}

export function summarizeChangeLog(row: ChangeLogRow, ctx: ChangeLogContext): string {
  const rec = (row.after ?? row.before) as Record<string, unknown> | null;
  if (!rec) return `${row.table_name} ${row.action}`;

  switch (row.table_name) {
    case "meal_exceptions": {
      const name = ctx.residentNames[rec.resident_id as string] ?? "(不明な利用者)";
      const typeLabel = rec.type === "absent" ? "欠食" : "臨時喫食";
      if (row.action === "DELETE") return `${rec.date} ${meal(rec.meal)} ${name} の${typeLabel}登録を削除`;
      return `${rec.date} ${meal(rec.meal)} ${name} を${typeLabel}に登録`;
    }
    case "daily_meal_extras": {
      if (row.action === "DELETE") return `${rec.date} ${meal(rec.meal)} 職員・来客記録を削除`;
      return `${rec.date} ${meal(rec.meal)} 職員${rec.staff_count}名・来客${rec.visitor_count}名`;
    }
    case "kitchen_overrides": {
      const name = ctx.residentNames[rec.resident_id as string] ?? "(不明な利用者)";
      const typeLabel = rec.type === "absent" ? "欠食" : "臨時喫食";
      if (row.action === "DELETE") return `${meal(rec.meal)} ${name} の緊急入力を取り消し`;
      if (row.action === "UPDATE" && rec.resolved_at) {
        const resolution = rec.resolution === "overwritten" ? "Excelの内容を優先" : "そのまま維持";
        return `${meal(rec.meal)} ${name} の緊急入力をExcel取込時に解決（${resolution}）`;
      }
      return `${meal(rec.meal)} ${name} を緊急入力で${typeLabel}に登録`;
    }
    case "count_overrides": {
      const groupName = ctx.groupNames[rec.group_id as string] ?? "(不明な区分)";
      if (row.action === "DELETE") {
        return `${rec.date} ${meal(rec.meal)} ${groupName} の手動修正を解除`;
      }
      const before = row.before as Record<string, unknown> | null;
      const prevCount = before?.override_count;
      const arrow = prevCount != null ? `${prevCount}→${rec.override_count}` : `${rec.override_count}`;
      return `${rec.date} ${meal(rec.meal)} ${groupName} 実食数を${arrow}に手動修正（理由: ${rec.reason}）`;
    }
    case "residents": {
      const name = (rec.name as string) ?? "(不明)";
      if (row.action === "INSERT") return `利用者「${name}」を追加`;
      if (row.action === "DELETE") return `利用者「${name}」を削除`;
      const before = row.before as Record<string, unknown> | null;
      if (before && (before.left_on === null) !== (rec.left_on === null)) {
        const from = before.left_on === null ? "在籍" : "退所";
        const to = rec.left_on === null ? "在籍" : "退所";
        return `利用者「${name}」の在籍状態を${from}→${to}に変更`;
      }
      return `利用者「${name}」の情報を更新`;
    }
    case "resident_default_meals":
      return "標準喫食パターンを変更";
    case "shift_notes":
      return "連絡ノート(掃除当番など)を更新";
    default:
      return `${row.table_name} ${row.action}`;
  }
}
