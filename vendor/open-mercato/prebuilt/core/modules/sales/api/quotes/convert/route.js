import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestContainer } from "@open-mercato/shared/lib/di/container";
import { getAuthFromRequest } from "@open-mercato/shared/lib/auth/server";
import { resolveOrganizationScopeForRequest } from "@open-mercato/core/modules/directory/utils/organizationScope";
import { resolveSingleOrganizationIdOrDeny } from "@open-mercato/core/modules/directory/utils/organizationScopeFilter";
import { serializeOperationMetadata } from "@open-mercato/shared/lib/commands/operationMetadata";
import { resolveTranslations } from "@open-mercato/shared/lib/i18n/server";
import { CrudHttpError, isCrudHttpError } from "@open-mercato/shared/lib/crud/errors";
import {
  bridgeLegacyGuard,
  runMutationGuards
} from "@open-mercato/shared/lib/crud/mutation-guard-registry";
import { withScopedPayload } from "../../utils.js";
import { createLogger } from "@open-mercato/shared/lib/logger";
import { getCommandInterceptorHttpRejection } from "@open-mercato/shared/lib/commands/errors";
const logger = createLogger("sales");
const convertSchema = z.object({
  quoteId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  orderNumber: z.string().trim().max(191).optional()
});
const metadata = {
  POST: { requireAuth: true, requireFeatures: ["sales.quotes.manage", "sales.orders.manage"] }
};
function resolveUserFeatures(auth) {
  const features = auth?.features;
  if (!Array.isArray(features)) return [];
  return features.filter((value) => typeof value === "string");
}
async function runGuards(ctx, input) {
  const legacyGuard = bridgeLegacyGuard(ctx.container);
  if (!legacyGuard) {
    return { ok: true, afterSuccessCallbacks: [] };
  }
  return runMutationGuards([legacyGuard], input, {
    userFeatures: resolveUserFeatures(ctx.auth)
  });
}
async function runGuardAfterSuccessCallbacks(callbacks, input) {
  for (const callback of callbacks) {
    if (!callback.guard.afterSuccess) continue;
    await callback.guard.afterSuccess({
      ...input,
      metadata: callback.metadata ?? null
    });
  }
}
async function resolveRequestContext(req) {
  const container = await createRequestContainer();
  const auth = await getAuthFromRequest(req);
  const { translate } = await resolveTranslations();
  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate("sales.documents.errors.unauthorized", "Unauthorized") });
  }
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req });
  const organizationId = resolveSingleOrganizationIdOrDeny(scope, auth) ?? null;
  if (!organizationId) {
    throw new CrudHttpError(400, {
      error: translate("sales.documents.errors.organization_required", "Organization context is required")
    });
  }
  const ctx = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req
  };
  return { ctx };
}
async function POST(req) {
  try {
    const { ctx } = await resolveRequestContext(req);
    const { translate } = await resolveTranslations();
    const payload = await req.json().catch(() => ({}));
    const scoped = withScopedPayload(payload ?? {}, ctx, translate);
    const input = convertSchema.parse(scoped);
    const guardResult = await runGuards(ctx, {
      tenantId: ctx.auth?.tenantId ?? "",
      organizationId: ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null,
      userId: ctx.auth?.sub ?? "",
      resourceKind: "sales.quote",
      resourceId: input.quoteId,
      operation: "update",
      requestMethod: req.method,
      requestHeaders: req.headers
    });
    if (!guardResult.ok) {
      return NextResponse.json(guardResult.errorBody ?? { error: "Operation blocked by guard" }, { status: guardResult.errorStatus ?? 422 });
    }
    const commandBus = ctx.container.resolve("commandBus");
    const { result, logEntry } = await commandBus.execute("sales.quotes.convert_to_order", { input, ctx });
    const orderId = result?.orderId ?? input.orderId ?? input.quoteId;
    const jsonResponse = NextResponse.json({ orderId });
    if (logEntry?.undoToken && logEntry?.id && logEntry?.commandId) {
      jsonResponse.headers.set(
        "x-om-operation",
        serializeOperationMetadata({
          id: logEntry.id,
          undoToken: logEntry.undoToken,
          commandId: logEntry.commandId,
          actionLabel: logEntry.actionLabel ?? null,
          resourceKind: logEntry.resourceKind ?? "sales.order",
          resourceId: logEntry.resourceId ?? orderId,
          executedAt: logEntry.createdAt instanceof Date ? logEntry.createdAt.toISOString() : typeof logEntry.createdAt === "string" ? logEntry.createdAt : (/* @__PURE__ */ new Date()).toISOString()
        })
      );
    }
    if (guardResult.afterSuccessCallbacks.length) {
      await runGuardAfterSuccessCallbacks(guardResult.afterSuccessCallbacks, {
        tenantId: ctx.auth?.tenantId ?? "",
        organizationId: ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null,
        userId: ctx.auth?.sub ?? "",
        resourceKind: "sales.quote",
        resourceId: input.quoteId,
        operation: "update",
        requestMethod: req.method,
        requestHeaders: req.headers
      });
    }
    return jsonResponse;
  } catch (err) {
    if (isCrudHttpError(err)) {
      return NextResponse.json(err.body, { status: err.status });
    }
    const interceptorRejection = getCommandInterceptorHttpRejection(err);
    if (interceptorRejection) {
      return NextResponse.json(interceptorRejection.body, { status: interceptorRejection.status });
    }
    if (err && typeof err === "object" && err.name === "ZodError") {
      const issues = err.issues ?? [];
      return NextResponse.json({ error: "\u53C2\u6570\u6821\u9A8C\u5931\u8D25", details: issues }, { status: 422 });
    }
    const { translate } = await resolveTranslations();
    logger.error("sales.quotes.convert failed", { err });
    return NextResponse.json(
      { error: translate("sales.documents.detail.convertError", "Failed to convert quote.") },
      { status: 400 }
    );
  }
}
const convertResponseSchema = z.object({
  orderId: z.string().uuid()
});
const openApi = {
  tag: "Sales",
  summary: "Convert quote to order",
  methods: {
    POST: {
      summary: "Convert quote",
      description: "Creates a sales order from a quote and removes the original quote record.",
      requestBody: {
        contentType: "application/json",
        schema: convertSchema
      },
      responses: [
        { status: 200, description: "Conversion succeeded", schema: convertResponseSchema },
        { status: 400, description: "Invalid payload", schema: z.object({ error: z.string() }) },
        { status: 401, description: "Unauthorized", schema: z.object({ error: z.string() }) },
        { status: 403, description: "Forbidden", schema: z.object({ error: z.string() }) },
        { status: 409, description: "Conflict detected", schema: z.object({ error: z.string(), code: z.string().optional() }) },
        { status: 423, description: "Record locked", schema: z.object({ error: z.string(), code: z.string().optional() }) }
      ]
    }
  }
};
export {
  POST,
  metadata,
  openApi
};
//# sourceMappingURL=route.js.map
