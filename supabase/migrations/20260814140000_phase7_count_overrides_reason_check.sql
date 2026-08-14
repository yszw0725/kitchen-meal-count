-- Phase 7: count_overrides.reason の空文字入力を禁止する
-- NOT NULL制約だけでは空文字列('')の保存を防げないため、check制約を追加する。

alter table count_overrides
  add constraint count_overrides_reason_not_blank check (btrim(reason) <> '');
