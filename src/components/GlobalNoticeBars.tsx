"use client"

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const DEMO_NOTICE_COOKIE = 'om_demo_notice_ack'
const COOKIE_NOTICE_COOKIE = 'om_cookie_notice_ack'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))
  return match ? match.split('=').slice(1).join('=') : null
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return
  const maxAge = days * 24 * 60 * 60
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function GlobalNoticeBars({ demoModeEnabled }: { demoModeEnabled: boolean }) {
  const t = useT()
  const [showDemoNotice, setShowDemoNotice] = useState(false)
  const [showCookieNotice, setShowCookieNotice] = useState(false)

  useEffect(() => {
    if (demoModeEnabled && !getCookie(DEMO_NOTICE_COOKIE)) {
      setShowDemoNotice(true)
    }
    if (!getCookie(COOKIE_NOTICE_COOKIE)) {
      setShowCookieNotice(true)
    }
  }, [demoModeEnabled])

  const [host, setHost] = useState<HTMLElement | null>(null)

  // Render the notices in-flow at the top of the page content instead of as a
  // fixed bottom overlay. The bars used to cover the last rows of tables (and
  // their action column) on first visit. When the shell has no <main> (public
  // marketing pages), fall back to the fixed presentation below.
  useEffect(() => {
    const hostElement = document.createElement('div')
    hostElement.setAttribute('data-global-notice-host', '')
    let observer: MutationObserver | null = null
    const attach = (): boolean => {
      const main = document.getElementById('main-content')
      if (!main) return false
      if (hostElement.parentElement !== main) main.prepend(hostElement)
      setHost(hostElement)
      return true
    }
    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }
    return () => {
      observer?.disconnect()
      hostElement.remove()
    }
  }, [])

  // Only one notice at a time: the demo notice is contextual and dismissible,
  // the cookie notice follows once it is acknowledged. Two stacked fixed bars
  // covered the bottom of the viewport on first visit.
  const cookieVisible = showCookieNotice && !showDemoNotice
  const activeBars = [showDemoNotice, cookieVisible].filter(Boolean).length
  if (activeBars === 0) return null

  const handleDismissDemo = () => {
    setCookie(DEMO_NOTICE_COOKIE, 'ack')
    setShowDemoNotice(false)
  }

  const handleDismissCookies = () => {
    setCookie(COOKIE_NOTICE_COOKIE, 'dismissed')
    setShowCookieNotice(false)
  }

  const handleAcceptCookies = () => {
    setCookie(COOKIE_NOTICE_COOKIE, 'ack')
    setShowCookieNotice(false)
  }

  const content = (
    <div
      className={
        host
          ? 'mb-4 flex w-full flex-col gap-2'
          : 'pointer-events-none fixed inset-x-0 bottom-4 z-banner flex flex-col items-center gap-3 px-4'
      }
      data-global-notice-bars={host ? 'inline' : 'floating'}
    >
      {showDemoNotice ? (
        <div className="pointer-events-auto w-full max-w-[calc(100vw-2rem)] sm:max-w-4xl rounded-lg border border-status-warning-border bg-status-warning-bg/90 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-status-warning-bg/80">
          <div className="flex items-start gap-3">
            <div className="flex-1 text-sm text-status-warning-text space-y-1">
              <p className="font-medium">{t('notices.demo.title', 'Demo Environment')}</p>
              <p>
                {t('notices.demo.description', 'This instance is provided for demo purposes only. Data may be reset at any time and is not retained for any guaranteed period.')}
              </p>
              <p>
                {t('notices.demo.superadminQuestion', 'Need persistent superadmin access?')}{' '}
                <a
                  href="https://github.com/open-mercato"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium hover:text-status-warning-icon"
                >
                  {t('notices.demo.installLink', 'Install ILA3 Commerce locally')}
                </a>
                . {t('notices.demo.reviewLinks', 'Review our')}{' '}
                <Link className="underline font-medium hover:text-status-warning-icon" href="/terms">
                  {t('common.terms')}
                </Link>{' '}
                {t('notices.demo.and', 'and')}{' '}
                <Link className="underline font-medium hover:text-status-warning-icon" href="/privacy">
                  {t('common.privacy')}
                </Link>
                .
              </p>
            </div>
            <IconButton
              type="button"
              variant="ghost"
              size="lg"
              onClick={handleDismissDemo}
              className="shrink-0 text-status-warning-text hover:text-status-warning-icon"
              aria-label={t('notices.demo.dismiss', 'Dismiss demo notice')}
            >
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
      ) : null}

      {cookieVisible ? (
        <div className="pointer-events-auto w-full max-w-[calc(100vw-2rem)] sm:max-w-4xl rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t('notices.cookies.description', 'We use essential cookies to remember your preferences. Learn how we handle data in our')}{' '}
              <Link className="underline font-medium hover:text-foreground" href="/privacy">
                {t('common.privacy')}
              </Link>.
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button type="button" variant="ghost" size="sm" onClick={handleDismissCookies}>
                {t('notices.cookies.dismiss', 'Dismiss')}
              </Button>
              <Button type="button" size="sm" onClick={handleAcceptCookies}>
                {t('notices.cookies.accept', 'Accept cookies')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return host ? createPortal(content, host) : content
}
