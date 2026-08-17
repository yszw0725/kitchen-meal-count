// 実ファイル検証で判明した、栄養管理ソフト側の配食番号プレフィックス
// (例: 「⑧配食）豚肉と根菜のうま煮」の「⑧配食）」)を、表示時にのみ
// 取り除く。menu_items.dish_nameの保存内容は加工しない(取込元の原本
// テキストをそのまま保持する既存方針を維持するため)。
const DISH_PREFIX_RE = /^[①-⑳](配食[）)])/;

export function formatDishName(dishName: string): string {
  return dishName.replace(DISH_PREFIX_RE, "");
}
