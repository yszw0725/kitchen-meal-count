-- アプリ内管理への移行 段階A(利用者管理画面の新設)
-- 設計書「アプリ内管理への移行設計書.md」§3.2・§5.1・§6(段階A)に対応。
--
-- residentsはこれまでExcel取込(service_role)専用の書込みだったが、
-- 利用者名簿をアプリ内で管理できるようにするため、adminによる直接の
-- INSERT/UPDATEを許可する。kitchenは引き続き閲覧のみ(変更なし)。
-- 退所は物理削除ではなくleft_onへの日付記録(論理削除)のみで行う設計
-- (設計書§5.1)のため、DELETEポリシーは追加しない。

create policy residents_insert on residents
  for insert to authenticated
  with check (is_admin());

create policy residents_update on residents
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- 新規利用者登録時、区分に応じた標準喫食パターン(入所系=全21マスtrue、
-- GH系=平日昼のみtrue)を自動シードする。既存のExcel取込時のシード処理
-- (apply_excel_import内の1c、Phase 8で追加)と同じロジックを流用する。
--
-- SECURITY DEFINERにせず(デフォルトのSECURITY INVOKER)、呼び出し元の
-- 権限のままresidents/resident_default_mealsへ書き込む。両テーブルとも
-- 既にadmin限定の書込みRLSを持つため、この関数内で改めてis_admin()を
-- チェックする必要はなく、RLSがそのまま適用される。1回のPL/pgSQL関数
-- 呼び出しは暗黙に1トランザクションになるため、residentsへの追加と
-- resident_default_mealsへのシードがどちらも行われるか、どちらも行われ
-- ないかのいずれかになる(Excel取込で過去に発生した「新規利用者だけ追加
-- され、標準パターンのシードが漏れる」不具合と同じ状態を防ぐ)。
create function create_resident_with_default_pattern(
  p_name text,
  p_group_id uuid,
  p_meal_form text[]
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_resident_id uuid;
  v_is_gh boolean;
begin
  insert into residents (group_id, name, meal_form)
  values (p_group_id, p_name, p_meal_form)
  returning id into v_resident_id;

  select short_name ilike '%GH%' into v_is_gh
  from resident_groups
  where id = p_group_id;

  insert into resident_default_meals (resident_id, weekday, meal, eats)
  select
    v_resident_id,
    w.weekday,
    mm.meal,
    case
      when v_is_gh then (mm.meal = 'lunch' and w.weekday between 1 and 5)
      else true
    end
  from generate_series(0, 6) as w (weekday)
  cross join (select unnest(enum_range(null::meal_type)) as meal) mm;

  return v_resident_id;
end;
$$;

revoke execute on function create_resident_with_default_pattern(text, uuid, text[]) from public;
revoke execute on function create_resident_with_default_pattern(text, uuid, text[]) from anon;
grant execute on function create_resident_with_default_pattern(text, uuid, text[]) to authenticated;
