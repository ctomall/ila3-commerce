# workflows — Active extension bindings

[Back to module index](index.md)

## Active extension bindings

| Activation | Kind | Host | Contribution kinds | Phases | Bridge | Source |
|---|---|---|---|---|---|---|
| entity:workflows.definition_draft:mutation-guard | mutation-guard | entity:workflows.definition_draft @workflows | mutation-guard | — | — | [api/definitions/[id]/draft/route.ts:227](../../../../node_modules/@open-mercato/core/src/modules/workflows/api/definitions/[id]/draft/route.ts#L227) |
| entity:workflows.definition:mutation-guard | mutation-guard | entity:workflows.definition @workflows | mutation-guard | — | — | [api/definitions/[id]/customize/route.ts:67](../../../../node_modules/@open-mercato/core/src/modules/workflows/api/definitions/[id]/customize/route.ts#L67) |
| entity:workflows.instance:mutation-guard | mutation-guard | entity:workflows.instance @workflows | mutation-guard | — | — | [api/instances/[id]/context/route.ts:105](../../../../node_modules/@open-mercato/core/src/modules/workflows/api/instances/[id]/context/route.ts#L105) |
| widget-spot:data-table:workflows.tasks.list:row-actions:widget-injection-consumer | widget-injection-consumer | widget-spot:data-table:workflows.tasks.list:row-actions @workflows | widget, data-table, crud-form | — | hosts:tasksTable.rowActions | [extension-points.ts](../../../../node_modules/@open-mercato/core/src/modules/workflows/extension-points.ts) |

<!-- end module facts section: workflows/active-extension-bindings -->
