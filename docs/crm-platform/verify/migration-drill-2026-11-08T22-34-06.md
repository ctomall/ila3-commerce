# Leadgen migration drill — 2026-11-08T22:34:06.027Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/.neg-migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |

**Result: FAIL** — snapshot not found: /tmp/leadgen-drill/.neg-migrations/.snapshot-open-mercato.json
