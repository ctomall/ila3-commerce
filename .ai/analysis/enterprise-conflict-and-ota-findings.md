# Conflict-state and OTA-entry evidence

Date: 2026-11-17

## Optimistic-lock conflict (real API, scratch row only)

`scripts/enterprise-conflict-drill.mjs`, evidence
`docs/crm-platform/evidence/conflict-drill-2026-11-17T151218243Z.json` (passed):

| Step | Result |
| --- | --- |
| create scratch company | 201 |
| save with current `updatedAt` | 200, new `updatedAt` returned |
| save again with the stale `updatedAt` | **409 `optimistic_lock_conflict`** |
| conflict body | `expectedUpdatedAt` (stale) + `currentUpdatedAt` (fresh) both present |
| stale write applied? | no — the stored industry stayed the first save's value |
| cleanup | DELETE 200, list no longer returns it, DB has 0 `Conflict Drill%` rows |

Only the row this drill created was written and it was removed at the end; no
other row, release or credential was touched.

## OTA entry point in the UI

`scripts/ota-entry-ui-check.mjs`, evidence
`docs/deployment/ota-entry-ui-20261117T151338Z.json`:

- `/backend/config/system-update` renders "系统升级 / 真实发布状态" for the
  superadmin;
- shows the running app release `v0.2.11 d8831e4c` with build time and "无可用更新";
- shows the kernel release `v0.9.0` separately and states it is not upgradable
  from this page;
- shows the deploy lock as free ("发布锁空闲") with its read timestamp.

This complements the earlier API-level OTA verification (artifact integrity,
upgrade lock, rollback target, failure drills): the human entry point renders
the same facts. It does not claim zero downtime or a phone/OTA firmware update.
