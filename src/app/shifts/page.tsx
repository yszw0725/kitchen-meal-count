import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { addDays, formatDateLabel } from "@/lib/board-date";
import EditableNotePanel from "@/components/editable-note-panel";

type ShiftStaffRow = { id: string; name: string; sortOrder: number };
type ShiftEntryRow = { date: string; staffId: string; code: string };
type ShiftDateEventRow = { date: string; note: string };
type NoteInfo = { content: string; updatedAt: string | null };
type ShiftBoard = {
  events: NoteInfo | null;
  workNotes: NoteInfo | null;
  startDate: string | null;
  endDate: string | null;
  staff: ShiftStaffRow[];
  entries: ShiftEntryRow[];
  dateEvents: ShiftDateEventRow[];
};

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function weekDates(startDate: string, weekIndex: number): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, weekIndex * 7 + i));
}

function formatShort(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// 資料と同じ「第1・2週／職員名／第3・4週」の配置を、改行・分断なく横一直線
// に収める(要望により、以前の週ペアごとに分割した2テーブル構成から変更)。
// 4週×7日=28列と職員名列を1つのtableにまとめ、コマの幅・文字サイズは
// 1280px幅に収まるよう小さめにしている。
function ShiftGrid({
  weekDateGroups,
  staff,
  codeOf,
  noteOf,
}: {
  weekDateGroups: string[][];
  staff: ShiftStaffRow[];
  codeOf: (staffId: string, date: string) => string;
  noteOf: (date: string) => string;
}) {
  const leftDates = [...weekDateGroups[0], ...weekDateGroups[1]];
  const rightDates = [...weekDateGroups[2], ...weekDateGroups[3]];

  // table-layout: fixedで職員名列の幅を確定的に確保する(table-layout: auto
  // だと、全28日付列+職員名列の合計が指定幅を超える際にブラウザの自動配分に
  // 委ねられ、職員名が想定より狭くなることがあった)。職員名列だけ明示的な
  // 幅を指定し、残りの日付列(28列)は指定なし=均等割りにする(fixedテーブル
  // レイアウトの仕様上、幅未指定の列は残り幅を均等に分け合う)。
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-2">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          {leftDates.map((date) => (
            <col key={date} />
          ))}
          <col className="w-[150px]" />
          {rightDates.map((date) => (
            <col key={date} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              colSpan={7}
              className="border border-zinc-200 bg-zinc-100 px-0.5 py-1 text-center text-xs font-bold text-zinc-700"
            >
              第1週({formatShort(weekDateGroups[0][0])}〜{formatShort(weekDateGroups[0][6])})
            </th>
            <th
              colSpan={7}
              className="border border-zinc-200 bg-zinc-100 px-0.5 py-1 text-center text-xs font-bold text-zinc-700"
            >
              第2週({formatShort(weekDateGroups[1][0])}〜{formatShort(weekDateGroups[1][6])})
            </th>
            <th
              rowSpan={3}
              className="border border-zinc-200 bg-zinc-100 px-2 py-1 text-center text-xs font-bold text-zinc-700"
            >
              職員名
            </th>
            <th
              colSpan={7}
              className="border border-zinc-200 bg-zinc-100 px-0.5 py-1 text-center text-xs font-bold text-zinc-700"
            >
              第3週({formatShort(weekDateGroups[2][0])}〜{formatShort(weekDateGroups[2][6])})
            </th>
            <th
              colSpan={7}
              className="border border-zinc-200 bg-zinc-100 px-0.5 py-1 text-center text-xs font-bold text-zinc-700"
            >
              第4週({formatShort(weekDateGroups[3][0])}〜{formatShort(weekDateGroups[3][6])})
            </th>
          </tr>
          <tr>
            {[...leftDates, ...rightDates].map((date) => {
              const note = noteOf(date);
              return (
                <th
                  key={date}
                  className={`border border-zinc-200 px-0.5 py-0.5 text-center text-[9px] leading-tight font-normal ${
                    note ? "bg-amber-50 text-amber-700" : "bg-zinc-50"
                  }`}
                >
                  {note}
                </th>
              );
            })}
          </tr>
          <tr>
            {[...leftDates, ...rightDates].map((date) => {
              const day = Number(date.split("-")[2]);
              const weekday = WEEKDAY_LABELS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
              return (
                <th
                  key={date}
                  className="border border-zinc-200 bg-zinc-50 px-0.5 py-0.5 text-center font-normal"
                >
                  <div className="text-[9px] text-zinc-400">{weekday}</div>
                  <div className="text-[11px] font-bold text-zinc-700">{day}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              {leftDates.map((date) => (
                <td key={date} className="border border-zinc-200 px-0.5 py-0.5 text-center text-zinc-800">
                  {codeOf(s.id, date)}
                </td>
              ))}
              <td className="border border-zinc-200 px-2 py-0.5 text-xs font-bold break-words text-zinc-800">
                {s.name}
              </td>
              {rightDates.map((date) => (
                <td key={date} className="border border-zinc-200 px-0.5 py-0.5 text-center text-zinc-800">
                  {codeOf(s.id, date)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ShiftsPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  // 勤務表の表示に必要なデータを1回のRPC呼び出しで取得する(以前はshift_imports
  // 等→shift_staff/shift_entries/shift_date_eventsの2段階の逐次往復だった)。
  const { data: board } = await supabase.rpc("get_shift_board");
  const {
    events,
    workNotes,
    startDate,
    endDate,
    staff,
    entries,
    dateEvents: dateEventList,
  } = (board ?? {
    events: null,
    workNotes: null,
    startDate: null,
    endDate: null,
    staff: [],
    entries: [],
    dateEvents: [],
  }) as ShiftBoard;

  const codeMap = new Map(entries.map((e) => [`${e.staffId}|${e.date}`, e.code]));
  const noteMap = new Map(dateEventList.map((e) => [e.date, e.note]));

  const codeOf = (staffId: string, date: string) => codeMap.get(`${staffId}|${date}`) ?? "";
  const noteOf = (date: string) => noteMap.get(date) ?? "";

  return (
    <main className="mx-auto w-full max-w-[1900px] space-y-3 p-4">
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
        initialNote={{ content: events?.content ?? "", updatedAt: events?.updatedAt ?? null }}
        rows={2}
      >
        {dateEventList.length > 0 && (
          <div className="border-t border-zinc-100 pt-2">
            <p className="mb-1 text-xs font-medium text-zinc-500">
              勤務表ファイルから読み取った予定
            </p>
            <ul className="space-y-0.5 text-sm text-zinc-700">
              {dateEventList.map((e) => (
                <li key={e.date}>
                  {formatShort(e.date)} {e.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </EditableNotePanel>

      {!startDate ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-400">
          まだ勤務表がアップロードされていません。
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            {formatDateLabel(startDate)} 〜 {formatDateLabel(endDate!)}
          </p>
          <ShiftGrid
            weekDateGroups={[0, 1, 2, 3].map((w) => weekDates(startDate, w))}
            staff={staff}
            codeOf={codeOf}
            noteOf={noteOf}
          />
        </div>
      )}

      <EditableNotePanel
        table="shift_work_notes"
        title="メモ"
        emptyLabel="まだ何も書かれていません。"
        userId={user.id}
        initialNote={{ content: workNotes?.content ?? "", updatedAt: workNotes?.updatedAt ?? null }}
        rows={3}
      />
    </main>
  );
}
