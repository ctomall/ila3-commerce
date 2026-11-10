/**
 * Human labels for the hub's delivery lifecycle.
 *
 * `unknown` is the one status that must never read like success: the provider may
 * have accepted the message while the local commit failed (see D2 / ADR-02), so
 * the UI says the result is unknown and tells the operator not to resend.
 */
const LABELS: Record<string, string> = {
  queued: '排队中',
  pending: '待发送',
  sent: '已发送',
  delivered: '已送达',
  read: '已读',
  failed: '发送失败',
  unknown: '结果未知（勿重发）',
}

export function deliveryStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return LABELS[status] ?? status
}
