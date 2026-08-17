import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { formatDateLabel } from "@/lib/board-date";
import { formatDishName } from "@/lib/menu-import/format";

type MenuItemRow = {
  date: string;
  meal: MealType;
  sortOrder: number;
  dishName: string;
};

type MenuBoard = {
  startDate: string | null;
  endDate: string | null;
  items: MenuItemRow[];
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default async function MenuPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  // 献立表の表示に必要なデータを1回のRPC呼び出しで取得する(以前は
  // menu_imports→menu_itemsの2段階の逐次往復だったため、ネットワーク
  // 遅延の影響を受けやすかった。S2トップのget_day_boardと同じ考え方)。
  const { data: board } = await supabase.rpc("get_menu_board");
  const { startDate, endDate, items } = (board ?? { startDate: null, endDate: null, items: [] }) as MenuBoard;

  const itemsByDate = new Map<string, MenuItemRow[]>();
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? [];
    list.push(item);
    itemsByDate.set(item.date, list);
  }

  const dates: string[] = [];
  if (startDate) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${startDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">週間献立表</h1>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      {!startDate ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-400">
          まだ献立表がアップロードされていません。
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {formatDateLabel(startDate)} 〜 {formatDateLabel(endDate!)}
          </p>
          <div className="grid grid-cols-7 items-start gap-2 overflow-x-auto">
            {dates.map((date) => {
              const dayItems = itemsByDate.get(date) ?? [];
              return (
                <div key={date} className="min-w-[150px] rounded-lg border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-2 py-2 text-center text-sm font-bold text-zinc-800">
                    {formatDateLabel(date)}
                  </div>
                  <div className="divide-y divide-zinc-200 p-2">
                    {MEAL_ORDER.map((meal) => {
                      const mealItems = dayItems.filter((i) => i.meal === meal);
                      return (
                        <div key={meal} className="py-2 first:pt-0 last:pb-0">
                          <p className="text-xs font-bold text-zinc-500">【{MEAL_LABEL[meal]}】</p>
                          {mealItems.length === 0 ? (
                            <p className="text-xs text-zinc-300">-</p>
                          ) : (
                            mealItems.map((item) => (
                              <p key={item.sortOrder} className="text-xs leading-snug text-zinc-700">
                                {formatDishName(item.dishName)}
                              </p>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
