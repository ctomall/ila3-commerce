import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestContainer } from "@open-mercato/shared/lib/di/container";
import { getAuthFromRequest } from "@open-mercato/shared/lib/auth/server";
import { resolveOrganizationScopeForRequest } from "@open-mercato/core/modules/directory/utils/organizationScope";
import { resolveSingleOrganizationIdOrDeny } from "@open-mercato/core/modules/directory/utils/organizationScopeFilter";
import { resolveTranslations, detectLocale } from "@open-mercato/shared/lib/i18n/server";
import { CrudHttpError, isCrudHttpError, notFound } from "@open-mercato/shared/lib/crud/errors";
import {
  bridgeLegacyGuard,
  runMutationGuards
} from "@open-mercato/shared/lib/crud/mutation-guard-registry";
import crypto from "node:crypto";
import { withScopedPayload } from "../../utils.js";
import { hashAuthToken } from "../../../../auth/lib/tokenHash.js";
import { findOneWithDecryption } from "@open-mercato/shared/lib/encryption/find";
import { parseDecryptedFieldValue } from "@open-mercato/shared/lib/encryption/tenantDataEncryptionService";
import { SalesQuote } from "../../../data/entities.js";
import { quoteSendSchema } from "../../../data/validators.js";
import { sendEmail } from "@open-mercato/shared/lib/email/send";
import { resolveStatusEntryIdByValue } from "../../../lib/statusHelpers.js";
import { QuoteSentEmail } from "../../../emails/QuoteSentEmail.js";
import { createLogger } from "@open-mercato/shared/lib/logger";
const logger = createLogger("sales");
const metadata = {
  POST: { requireAuth: true, requireFeatures: ["sales.quotes.manage"] }
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
function resolveQuoteEmail(quote) {
  const normalizeRecord = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string") return null;
    const parsed2 = parseDecryptedFieldValue(value);
    return parsed2 && typeof parsed2 === "object" && !Array.isArray(parsed2) ? parsed2 : null;
  };
  const snapshot = normalizeRecord(quote.customerSnapshot);
  const metadata2 = normalizeRecord(quote.metadata);
  const contact = snapshot?.contact;
  const customer = snapshot?.customer;
  const candidate = typeof contact?.email === "string" && contact.email.trim() || typeof customer?.primaryEmail === "string" && customer.primaryEmail.trim() || typeof metadata2?.customerEmail === "string" && metadata2.customerEmail.trim() || null;
  if (!candidate) return null;
  const parsed = z.string().email().safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
async function POST(req) {
  try {
    const { ctx } = await resolveRequestContext(req);
    const { translate } = await resolveTranslations();
    const payload = await req.json().catch(() => ({}));
    const scoped = withScopedPayload(payload ?? {}, ctx, translate);
    const input = quoteSendSchema.parse(scoped);
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
    const em = ctx.container.resolve("em").fork();
    const tenantScope = ctx.auth?.tenantId ? { tenantId: ctx.auth.tenantId, organizationId: ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null } : void 0;
    const quote = await findOneWithDecryption(em, SalesQuote, { id: input.quoteId, deletedAt: null }, {}, tenantScope);
    if (!quote) {
      throw notFound(translate("sales.documents.detail.error", "Document not found or inaccessible."));
    }
    if (quote.tenantId !== ctx.auth?.tenantId || quote.organizationId !== ctx.selectedOrganizationId) {
      throw new CrudHttpError(403, { error: translate("sales.documents.errors.forbidden", "Forbidden") });
    }
    if ((quote.status ?? null) === "canceled") {
      throw new CrudHttpError(400, { error: translate("sales.quotes.send.canceled", "Canceled quotes cannot be sent.") });
    }
    const email = resolveQuoteEmail(quote);
    if (!email) {
      throw new CrudHttpError(400, { error: translate("sales.quotes.send.missingEmail", "Customer email is required to send a quote.") });
    }
    const now = /* @__PURE__ */ new Date();
    const validUntil = new Date(now);
    validUntil.setUTCDate(validUntil.getUTCDate() + input.validForDays);
    const rawAcceptanceToken = crypto.randomUUID();
    await em.transactional(async (tx) => {
      quote.validUntil = validUntil;
      quote.acceptanceToken = hashAuthToken(rawAcceptanceToken);
      quote.sentAt = now;
      quote.status = "sent";
      quote.statusEntryId = await resolveStatusEntryIdByValue(tx, {
        tenantId: quote.tenantId,
        organizationId: quote.organizationId,
        value: "sent"
      });
      quote.updatedAt = now;
      tx.persist(quote);
    });
    const appUrl = process.env.APP_URL || "";
    const url = appUrl ? `${appUrl.replace(/\/$/, "")}/quote/${rawAcceptanceToken}` : `/quote/${rawAcceptanceToken}`;
    const locale = await detectLocale();
    const validUntilFormatted = validUntil.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const copy = {
      preview: translate("sales.quotes.email.preview", "Quote {quoteNumber} is ready for review", { quoteNumber: quote.quoteNumber }),
      heading: translate("sales.quotes.email.heading", "Quote {quoteNumber}", { quoteNumber: quote.quoteNumber }),
      total: translate("sales.quotes.email.total", "Total: {amount} {currency}", {
        amount: quote.grandTotalGrossAmount ?? quote.grandTotalNetAmount ?? "0",
        currency: quote.currencyCode
      }),
      validUntil: translate("sales.quotes.email.validUntil", "Valid until: {date}", { date: validUntilFormatted }),
      cta: translate("sales.quotes.email.cta", "View quote"),
      footer: translate("sales.quotes.email.footer", "Open Mercato")
    };
    await sendEmail({
      to: email,
      subject: translate("sales.quotes.email.subject", "Quote {quoteNumber}", { quoteNumber: quote.quoteNumber }),
      react: QuoteSentEmail({ url, copy }),
      tenantId: quote.tenantId,
      organizationId: quote.organizationId
    });
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isCrudHttpError(err)) {
      return NextResponse.json(err.body, { status: err.status });
    }
    if (err && typeof err === "object" && err.name === "ZodError") {
      const issues = err.issues ?? [];
      return NextResponse.json({ error: "\u53C2\u6570\u6821\u9A8C\u5931\u8D25", details: issues }, { status: 422 });
    }
    const { translate } = await resolveTranslations();
    logger.error("sales.quotes.send failed", { err });
    return NextResponse.json(
      { error: translate("sales.quotes.send.failed", "Failed to send quote.") },
      { status: 400 }
    );
  }
}
const openApi = {
  tag: "Sales",
  summary: "Send quote to customer",
  methods: {
    POST: {
      summary: "Send quote",
      requestBody: {
        contentType: "application/json",
        schema: quoteSendSchema
      },
      responses: [
        { status: 200, description: "Email queued", schema: z.object({ ok: z.literal(true) }) },
        { status: 400, description: "Invalid payload", schema: z.object({ error: z.string() }) },
        { status: 401, description: "Unauthorized", schema: z.object({ error: z.string() }) },
        { status: 403, description: "Forbidden", schema: z.object({ error: z.string() }) },
        { status: 404, description: "Not found", schema: z.object({ error: z.string() }) },
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
