-- Phase 9 ステップ1: Phase 1で投入した検証用シードデータ(利用者59名)を削除する
--
-- 実データ投入前の準備。resident_groups(男性入所/女性入所/男性GH/女性GH)は
-- 実データでもそのまま使う区分のため削除しない(Phase 8でRLS上も削除不可に
-- 設定済み)。
--
-- 氏名は「区分名+2桁数字」という命名規則に厳密一致する正規表現で絞り込み、
-- 事前にSELECTで59件ちょうど一致することを確認済み。

-- 手順1: 検証用meal_exceptions を先に削除
-- (residentsへのFKはON DELETE CASCADEではないため、これを先に行わないと
--  手順2が外部キー制約違反で失敗する)
delete from meal_exceptions
where resident_id in (
  select id from residents
  where name ~ '^(男性入所|女性入所|男性GH|女性GH)[0-9]{2}$'
);

-- 手順2: シード利用者を削除 (resident_default_mealsはON DELETE CASCADEで自動削除される)
delete from residents
where name ~ '^(男性入所|女性入所|男性GH|女性GH)[0-9]{2}$';
