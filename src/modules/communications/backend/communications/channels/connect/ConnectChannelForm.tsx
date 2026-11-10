'use client'

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { Input } from '@open-mercato/ui/primitives/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { PROVIDERS, buildCredentials, mapConnectError, type ProviderKey } from './connect-channel'

type ConnectResponse = {
  channelId?: string
  externalIdentifier?: string
  error?: string
  code?: string
}

export function ConnectChannelForm() {
  const [providerKey, setProviderKey] = React.useState<ProviderKey>('whatsapp-business')
  const [displayName, setDisplayName] = React.useState('')
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<ConnectResponse | null>(null)

  const provider = PROVIDERS.find((entry) => entry.key === providerKey) ?? PROVIDERS[0]

  const changeProvider = (next: string) => {
    setProviderKey(next as ProviderKey)
    setValues({})
    setError(null)
    setSuccess(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const response = await apiCall<ConnectResponse>('/api/communication_channels/channels/connect/tenant-credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerKey,
          displayName: displayName.trim() || provider.defaultDisplayName,
          credentials: buildCredentials(provider, values),
        }),
      })
      if (response.ok) {
        setSuccess(response.result ?? {})
        return
      }
      setError(mapConnectError(response.status, response.result?.error ?? null))
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold">连接渠道</h1>
            <p className="text-sm text-muted-foreground">
              为整个组织创建 WhatsApp 或 Messenger 渠道。凭据只提交给服务端，不写入日志。
            </p>
          </header>

          {error ? (
            <Alert variant="destructive">{error}</Alert>
          ) : null}
          {success ? (
            <Alert>
              渠道已连接{success.externalIdentifier ? `（外部账号 ${success.externalIdentifier}）` : ''}。
              <a className="ml-1 underline" href="/backend/communication_channels/channels">查看渠道</a>
            </Alert>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={submit}>
            <FormField label="渠道类型" required>
              <Select value={providerKey} onValueChange={changeProvider}>
                <SelectTrigger id="providerKey" aria-label="渠道类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="显示名称" description="员工在收件箱里看到的渠道名称" required>
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={provider.defaultDisplayName}
                autoComplete="off"
              />
            </FormField>

            {provider.fields.map((field) => (
              <FormField key={field.key} label={field.label} description={field.description} required={field.required}>
                <Input
                  id={field.key}
                  type={field.secret ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
            ))}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busy}>{busy ? '连接中…' : '连接'}</Button>
              <a className="text-sm underline" href="/backend/communications/inbox">返回收件箱</a>
            </div>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
