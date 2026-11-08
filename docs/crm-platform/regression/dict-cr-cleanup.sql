-- 字典名称控制字符清理（**待批准，未执行**）
--
-- 背景：`applySnapshot` 的 control-character 清洗是写入口拦截，不会回改历史行。
--
-- 实测事实（第 28 轮，`node scripts/crm-dict-cr-audit.mjs` 的只读输出）：
--   dictionaries               19 行，**全部 19 行**的 name 带 CR（不是零星几行）
--   dictionaries.description   0 条
--   dictionaries.key           0 条
--   dictionary_entries         291 行；label / value **0 条**带 CR
--   每行恰好 1 个 CR，且都在**末尾**（清洗后名称 2–7 个字符：货币/单位 2，其余 4–7）
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

-- ── 1) 事务内：捕获 → 清理 → 断言（不满足就 RAISE，不是"打印看看"） ─────────
--
-- 关键区别：裸 SELECT 打印一个数字，psql 不会因此失败。上一版就是六条裸 SELECT，
-- 所以 UPDATE 命中 0 行时它照样打印期望值、照样 exit 0。这里用 `\set ON_ERROR_STOP on`
-- 加 DO 块 RAISE，任何一条断言不成立都会中止事务并让 psql 非零退出。
\set ON_ERROR_STOP on

begin;

-- 捕获与更新在同一个事务里。`on commit preserve rows` 是有意的：文档里承诺的
-- 精确回滚要在**提交之后**仍然可用，`on commit drop` 会让那张表在提交瞬间消失，
-- 于是回滚语句引用一个不存在的表（上一版的自相矛盾）。
create temp table dict_cr_targets on commit preserve rows as
select id, name as name_before
  from dictionaries
 where position(chr(13) in name) > 0;

create temp table dict_totals on commit preserve rows as
select count(*) as n from dictionaries;

-- 期望：19
select count(*) as captured_for_rollback from dict_cr_targets;

-- 只剥**末尾**的 CR：若某行 CR 在中间，这条不会碰它，断言会把它暴露出来，
-- 而不是被 replace() 悄悄一起删掉。
update dictionaries
   set name = regexp_replace(name, chr(13) || '+$', '')
 where position(chr(13) in name) > 0;

do $$
declare
  remaining_any bigint;
  remaining_trailing bigint;
  total_after bigint;
  total_before bigint;
  changed bigint;
  captures bigint;
  dup_groups bigint;
begin
  select count(*) into captures from dict_cr_targets;
  if captures = 0 then
    raise exception '捕获到 0 行：UPDATE 前就没有 CR，或审计读到的是空库';
  end if;

  select count(*) into remaining_any
    from dictionaries where position(chr(13) in name) > 0;
  if remaining_any <> 0 then
    raise exception '仍有 % 行带 CR（CR 可能在非末尾位置，需人工判断）', remaining_any;
  end if;

  select count(*) into remaining_trailing
    from dictionaries where regexp_replace(name, chr(13) || '+$', '') <> name;
  if remaining_trailing <> 0 then
    raise exception '仍有 % 行末尾带 CR', remaining_trailing;
  end if;

  select n into total_before from dict_totals;
  select count(*) into total_after from dictionaries;
  if total_after <> total_before then
    raise exception '行数变了：% -> %（本脚本不允许删行）', total_before, total_after;
  end if;

  select count(*) into changed
    from dictionaries d
    join dict_cr_targets t on t.id = d.id
   where d.name = regexp_replace(t.name_before, chr(13) || '+$', '');
  if changed <> captures then
    raise exception '改动行数 % 与捕获行数 % 不一致', changed, captures;
  end if;

  select count(*) into dup_groups from (
    select organization_id, tenant_id, name
      from dictionaries
     group by organization_id, tenant_id, name
    having count(*) > 1) dup;
  if dup_groups <> 0 then
    raise exception '清洗后同一 scope 内出现 % 组同名', dup_groups;
  end if;

  raise notice '全部断言通过：捕获 %，残留 0，行数 % 不变，改动 %，撞名 0', captures, total_after, changed;
end $$;

commit;

-- 跨会话回滚需要先把 id 留档；需要时执行（用 psql 的 \copy，不是 SQL）：
--   \copy (select id, name_before from dict_cr_targets) to '/tmp/dict-cr-targets.tsv'

-- ── 2) 精确回滚（同一会话内可用；演练时把 commit 改成 rollback） ────────────
--
-- `dict_cr_targets` 是 `on commit preserve rows`，所以提交之后它还在，直到会话结束。
-- 真回滚 = 把 CR 加回这 19 个 id：
--
--   \set ON_ERROR_STOP on
--   begin;
--   update dictionaries d
--      set name = d.name || chr(13)
--     from dict_cr_targets t
--    where t.id = d.id
--      and position(chr(13) in d.name) = 0;
--   select count(*) as restored_with_cr from dictionaries where position(chr(13) in name) > 0;  -- 期望 19
--   rollback;   -- 演练用 rollback；真要撤销就把这句改成 commit

-- ── 3) 执行后回归 ─────────────────────────────────────────────────────────
--   node scripts/crm-dict-cr-audit.mjs --assert-clean   # 期望 PASS
--   node scripts/crm-quote-regression.mjs               # 该项从"已知遗留"变为 0
--   node scripts/crm-verify-all.mjs --full
