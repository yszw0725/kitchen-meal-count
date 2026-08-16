import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { addDays, formatDateLabel } from "@/lib/board-date";
import EditableNotePanel from "@/components/editable-note-panel";

type ShiftStaffRow = { id: string; name: string; sort_order: number };
type ShiftEntryRow = { date: string; staff_id: string; code: string };

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function weekDates(startDate: string, weekIndex: number): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, weekIndex * 7 + i));
}

function formatShort(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function DayHeaderCells({ dates }: { dates: string[] }) {
  return (
    <>
      {dates.map((date, i) => {
        const day = Number(date.split("-")[2]);
        return (
          <th key={date} className="border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-center font-normal">
            <div className="text-[11px] text-zinc-400">{WEEKDAY_LABELS[i]}</div>
            <div className="text-xs font-bold text-zinc-700">{day}</div>
          </th>
        );
      })}
    </>
  );
}

function WeekPairTable({
  leftLabel,
  leftDates,
  rightLabel,
  rightDates,
  staff,
  codeOf,
}: {
  leftLabel: string;
  leftDates: string[];
  rightLabel: string;
  rightDates: string[];
  staff: ShiftStaffRow[];
  codeOf: (staffId: string, date: string) => string;
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th
            colSpan={7}
            className="border border-zinc-200 bg-zinc-100 px-1 py-1 text-center font-bold text-zinc-700"
          >
            {leftLabel}
          </th>
          <th className="border border-zinc-200 bg-zinc-100 px-2 py-1 text-center font-bold text-zinc-700">
            職員名
          </th>
          <th
            colSpan={7}
            className="border border-zinc-200 bg-zinc-100 px-1 py-1 text-center font-bold text-zinc-700"
          >
            {rightLabel}
          </th>
        </tr>
        <tr>
          <DayHeaderCells dates={leftDates} />
          <th className="border border-zinc-200 bg-zinc-50" />
          <DayHeaderCells dates={rightDates} />
        </tr>
      </thead>
      <tbody>
        {staff.map((s) => (
          <tr key={s.id}>
            {leftDates.map((date) => (
              <td key={date} className="border border-zinc-200 px-1 py-0.5 text-center text-zinc-800">
                {codeOf(s.id, date)}
              </td>
            ))}
            <td className="border border-zinc-200 px-2 py-0.5 whitespace-nowrap font-bold text-zinc-800">
              {s.name}
            </td>
            {rightDates.map((date) => (
              <td key={date} className="border border-zinc-200 px-1 py-0.5 text-center text-zinc-800">
                {codeOf(s.id, date)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ShiftsPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: latestImport }, { data: events }, { data: workNotes }] = await Promise.all([
    supabase
      .from("shift_imports")
      .select("id, start_date, end_date")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("shift_events").select("content, updated_at").eq("id", true).maybeSingle(),
    supabase.from("shift_work_notes").select("content, updated_at").eq("id", true).maybeSingle(),
  ]);

  let staff: ShiftStaffRow[] = [];
  let codeMap = new Map<string, string>();

  if (latestImport) {
    const [{ data: staffData }, { data: entryData }] = await Promise.all([
      supabase
        .from("shift_staff")
        .select("id, name, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("shift_entries")
        .select("date, staff_id, code")
        .eq("import_id", latestImport.id),
    ]);
    staff = (staffData ?? []) as ShiftStaffRow[];
    codeMap = new Map(
      ((entryData ?? []) as ShiftEntryRow[]).map((e) => [`${e.staff_id}|${e.date}`, e.code]),
    );
  }

  const codeOf = (staffId: string, date: string) => codeMap.get(`${staffId}|${date}`) ?? "";

  return (
    <main className="mx-auto w-full max-w-[1900px] flex-1 space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">勤務表</h1>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      <EditableNotePanel
        table="shift_events"
        title="行事・会議予定"
        emptyLabel="行事・会議予定はまだ登録されていません。"
        userId={user.id}
        initialNote={{ content: events?.content ?? "", updatedAt: events?.updated_at ?? null }}
        rows={2}
      />

      {!latestImport ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-400">
          まだ勤務表がアップロードされていません。
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            {formatDateLabel(latestImport.start_date)} 〜 {formatDateLabel(latestImport.end_date)}
          </p>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-2">
            <WeekPairTable
              leftLabel={`第1週(${formatShort(weekDates(latestImport.start_date, 0)[0])}〜${formatShort(weekDates(latestImport.start_date, 0)[6])})`}
              leftDates={weekDates(latestImport.start_date, 0)}
              rightLabel={`第3週(${formatShort(weekDates(latestImport.start_date, 2)[0])}〜${formatShort(weekDates(latestImport.start_date, 2)[6])})`}
              rightDates={weekDates(latestImport.start_date, 2)}
              staff={staff}
              codeOf={codeOf}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-2">
            <WeekPairTable
              leftLabel={`第2週(${formatShort(weekDates(latestImport.start_date, 1)[0])}〜${formatShort(weekDates(latestImport.start_date, 1)[6])})`}
              leftDates={weekDates(latestImport.start_date, 1)}
              rightLabel={`第4週(${formatShort(weekDates(latestImport.start_date, 3)[0])}〜${formatShort(weekDates(latestImport.start_date, 3)[6])})`}
              rightDates={weekDates(latestImport.start_date, 3)}
              staff={staff}
              codeOf={codeOf}
            />
          </div>
        </div>
      )}

      <EditableNotePanel
        table="shift_work_notes"
        title="メモ（掃除当番など）"
        emptyLabel="まだ何も書かれていません。"
        userId={user.id}
        initialNote={{ content: workNotes?.content ?? "", updatedAt: workNotes?.updated_at ?? null }}
        rows={3}
      />
    </main>
  );
}
