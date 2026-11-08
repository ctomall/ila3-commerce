-- 字典名称控制字符清理（待批准，未执行）
--
-- 背景：`applySnapshot` 的 control-character 清洗是写入口拦截，不会回改历史行。
-- 结果：19 条 `dictionaries.name` 尾部带 CR；条目（entries）的 label/value 为 0 条。
--
-- 影响面（已核对）：
--   dictionaries.name        19 条带 CR   ← 本脚本处理
--   dictionaries.description  0 条
--   dictionaries.key          0 条
--   dictionary_entries       0 条（label 与 value 均已干净）
--
-- 只改 `name`，不动 id/key/其它列，也不删任何行。

-- 1) 先看要改什么（只读）
select id, key, replace(name, chr(13), '<CR>') as name_with_marker
from dictionaries
where name like '%' || chr(13) || '%'
order by key;

-- 2) 事务内清理并核对
begin;

update dictionaries
set name = replace(name, chr(13), '')
where name like '%' || chr(13) || '%';

-- 期望：0
select count(*) as remaining_with_cr
from dictionaries
where name like '%' || chr(13) || '%';

-- 期望：19（与上面 count 一致）
select count(*) as touched_rows
from dictionaries
where name not like '%' || chr(13) || '%';

commit;

-- 3) 回滚方式
-- 本脚本只做字符串替换，无法用 SQL 精确回滚到“带 CR”的原值。
-- 若需要回滚，从执行前的备份恢复（先 pg_dump 再执行）。

-- 4) 执行后回归
--   node scripts/crm-quote-regression.mjs
--   node scripts/crm-verify-all.mjs
