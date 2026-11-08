-- 字典名称控制字符清理（**待批准，未执行**）
--
-- 背景：`applySnapshot` 的 control-character 清洗是写入口拦截，不会回改历史行。
--
-- 实测事实（第 28 轮，`node scripts/crm-dict-cr-audit.mjs` 的只读输出）：
--   dictionaries               19 行，**全部 19 行**的 name 带 CR（不是零星几行）
--   dictionaries.description   0 条
--   dictionaries.key           0 条
--   dictionary_entries         291 行；label / value **0 条**带 CR
--   每行恰好 1 个 CR，且都在**末尾**（18 个中文字符 + 1 个 CR）
--   清洗后同一 (organization_id, tenant_id) 内**无同名冲突**
--   唯一约束是 (organization_id, tenant_id, key)，不在 name 上；外键
--   `dictionary_entries.dictionary_id` 是 ON UPDATE CASCADE 且本脚本不动 id
--   → 数据库层面既不会因撞名报错，也不会因外键报错
--
-- 影响面：名字被直接显示在字典管理页与下拉里；291 条条目全部挂在这 19 个字典下，
-- 所以"改 19 行"在界面上覆盖全部字典。
--
-- 为什么值得单独审：`name` 上没有唯一约束，撞名不会被数据库拦住，只会在界面上
-- 变成两个一模一样的标签——这种事在 UPDATE 的 diff 里看不出来，必须先算。
--
-- 第 28 轮补充：本脚本已在**事务内干跑**（最后一句 commit 换成 rollback），六项断言
-- 全部符合预期：捕获 19、末尾 CR 残留 0、任意位置 CR 残留 0、总行数仍 19、
-- 改动行数 19、同名冲突组 0。回滚逆操作也实测过：清理后把 CR 加回 19 个 id，
-- `restored_with_cr = 19`。整个过程结束后生产库仍是 19 行 / 19 行带 CR —— 未执行。

-- ── 0) 前置：只读审计（人工核对用） ────────────────────────────────────────
select key, replace(name, chr(13), '<CR>') as name_with_marker,
       length(name) as chars_before
  from dictionaries
 where position(chr(13) in name) > 0
 order by key;

-- 期望：19 行，且每行 name_with_marker 都以 <CR> 结尾

-- ── 1) 事务内：捕获目标行 → 清理 → 逐项核对 ───────────────────────────────
begin;

-- 捕获和更新必须在同一个事务里：`on commit drop` 的临时表在自动提交模式下建完就没了。
-- 捕获的意义是让这个 UPDATE 有精确逆操作——把 CR 加回这些 id 即可。
create temp table dict_cr_targets on commit drop as
select id, name as name_before
  from dictionaries
 where position(chr(13) in name) > 0;

-- 期望：19
select count(*) as captured_for_rollback from dict_cr_targets;

-- 只剥**末尾**的 CR：若某行 CR 在中间，这条不会碰它，随后的断言会把它暴露出来，
-- 而不是被 replace() 悄悄一起删掉。
update dictionaries
   set name = regexp_replace(name, chr(13) || '+$', '')
 where position(chr(13) in name) > 0;

-- 期望：0（末尾 CR 已清；若 >0 说明存在中间 CR，必须停下人工判断）
select count(*) as remaining_trailing_cr
  from dictionaries
 where regexp_replace(name, chr(13) || '+$', '') <> name;

-- 期望：0（若 >0 说明 CR 出现在非末尾位置）
select count(*) as remaining_any_cr
  from dictionaries
 where position(chr(13) in name) > 0;

-- 期望：19 —— 证明只改了 name，没有删行
select count(*) as total_rows_after from dictionaries;

-- 期望：19 —— 证明改动行数正确
select count(*) as changed_rows
  from dictionaries d
  join dict_cr_targets t on t.id = d.id
 where d.name = regexp_replace(t.name_before, chr(13) || '+$', '');

-- 期望：0 —— 同一 scope 内没有因为清洗而撞名
select count(*) as duplicate_name_groups
  from (select organization_id, tenant_id, name
          from dictionaries
         group by organization_id, tenant_id, name
        having count(*) > 1) dup;

commit;

-- ── 2) 精确回滚（仅在需要撤销时执行） ─────────────────────────────────────
-- 在同一个会话里，`dict_cr_targets` 仍可读（on commit drop 只在本事务提交后消失；
-- 需要跨会话回滚时，先把 id 清单导出留档，再按同一 UPDATE 逆向执行）：
--
-- begin;
-- update dictionaries d
--    set name = name || chr(13)
--   from dict_cr_targets t
--  where t.id = d.id
--    and position(chr(13) in d.name) = 0;
-- -- 期望：19
-- select count(*) from dictionaries where position(chr(13) in name) > 0;
-- commit;
--
-- 更稳妥的回滚仍然是备份：执行前先 pg_dump（见 03b-migration-draft.md §5）。

-- ── 3) 执行后回归 ─────────────────────────────────────────────────────────
--   node scripts/crm-dict-cr-audit.mjs --assert-clean   # 期望 PASS
--   node scripts/crm-quote-regression.mjs               # 该项从"已知遗留"变为 0
--   node scripts/crm-verify-all.mjs --full
