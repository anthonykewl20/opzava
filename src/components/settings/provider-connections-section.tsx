'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'

interface SettingItem {
  key: string
  value: string
  sensitive?: boolean
  configured?: boolean
}

interface Props {
  showFeedback: (ok: boolean, text: string) => void
}

// Keys are defined server-side in /api/settings (category 'Provider Connections').
// Only non-secret fields live here; provider secrets are environment-provided (ARD 0008).
const KEYS = {
  wpSiteUrl: 'wordpress_site_url',
  resendFromAddress: 'resend_from_address',
  resendFromName: 'resend_from_name',
} as const

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        connected
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-surface-1/40 text-muted-foreground border border-border/30'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-muted-foreground/50'}`} />
      {connected ? 'Connected' : 'Not configured'}
    </span>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground/90">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-md border border-border/40 bg-surface-1/30 px-2.5 py-1.5 text-sm text-foreground ' +
  'placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-void-cyan/40 focus:border-void-cyan/40'

// A read-only note explaining that a provider secret is supplied via an environment variable
// (ARD 0008 — no cleartext secret is stored in the database).
function EnvSecretNote({ envVar, label }: { envVar: string; label: string }) {
  return (
    <p className="rounded-md border border-border/20 bg-surface-1/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      {label} is provided via the{' '}
      <code className="rounded bg-surface-1/40 px-1 py-0.5 font-mono text-foreground/90">{envVar}</code>{' '}
      environment variable — set it in your deployment, not here.
    </p>
  )
}

export function ProviderConnectionsSection({ showFeedback }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [wpSiteUrl, setWpSiteUrl] = useState('')

  const [resendFromAddress, setResendFromAddress] = useState('')
  const [resendFromName, setResendFromName] = useState('')

  const [testing, setTesting] = useState<'wordpress' | 'resend' | null>(null)
  const [testResult, setTestResult] = useState<{ provider: 'wordpress' | 'resend'; ok: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = await res.json()
      const byKey = new Map<string, SettingItem>((data.settings || []).map((s: SettingItem) => [s.key, s]))
      setWpSiteUrl(byKey.get(KEYS.wpSiteUrl)?.value ?? '')
      setResendFromAddress(byKey.get(KEYS.resendFromAddress)?.value ?? '')
      setResendFromName(byKey.get(KEYS.resendFromName)?.value ?? '')
    } catch {
      // ignore — leave fields blank
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      // Only non-secret connection fields are stored; provider secrets are environment-provided.
      const settings: Record<string, string> = {
        [KEYS.wpSiteUrl]: wpSiteUrl.trim(),
        [KEYS.resendFromAddress]: resendFromAddress.trim(),
        [KEYS.resendFromName]: resendFromName.trim(),
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showFeedback(false, body.error || 'Failed to save connections')
        return
      }
      await load()
      showFeedback(true, 'Provider connections saved')
    } catch {
      showFeedback(false, 'Failed to save connections')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async (provider: 'wordpress' | 'resend') => {
    setTesting(provider)
    setTestResult(null)
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json().catch(() => ({ ok: false, message: 'Test failed' }))
      setTestResult({ provider, ok: Boolean(data.ok), message: data.message || (data.ok ? 'OK' : 'Test failed') })
    } catch {
      setTestResult({ provider, ok: false, message: 'Could not run the test' })
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <div className="p-4 rounded-lg border border-border/30 bg-surface-1/20">
        <h3 className="text-sm font-medium mb-3">Provider Connections</h3>
        <div className="flex items-center justify-center py-4">
          <Loader />
        </div>
      </div>
    )
  }

  // "Connected" reflects the non-secret config being present; the env secret is checked by "Test".
  const wpConnected = wpSiteUrl.trim().length > 0
  const resendConnected = resendFromAddress.trim().length > 0

  return (
    <div className="p-4 rounded-lg border border-border/30 bg-surface-1/20">
      <h3 className="text-sm font-medium mb-1">Provider Connections</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Non-secret settings for publishing and email. Provider secrets are supplied via environment
        variables, never stored here — use Test to verify the deployment secret.
      </p>

      <div className="space-y-3">
        {/* WordPress */}
        <div className="rounded-lg border border-border/20 bg-surface-1/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">WordPress</span>
              <span className="text-[11px] text-muted-foreground">publishing — draft only</span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => testConnection('wordpress')}
                disabled={testing !== null}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {testing === 'wordpress' ? 'Testing…' : 'Test'}
              </button>
              <StatusPill connected={wpConnected} />
            </div>
          </div>
          <Field label="Site URL" hint="The WordPress site where drafts are created.">
            <input
              type="url"
              className={inputClass}
              placeholder="https://blog.example.com"
              value={wpSiteUrl}
              onChange={(e) => setWpSiteUrl(e.target.value)}
            />
          </Field>
          <EnvSecretNote envVar="WORDPRESS_APP_PASSWORD" label="Application password" />
        </div>

        {/* Resend */}
        <div className="rounded-lg border border-border/20 bg-surface-1/10 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Resend</span>
              <span className="text-[11px] text-muted-foreground">email</span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => testConnection('resend')}
                disabled={testing !== null}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {testing === 'resend' ? 'Testing…' : 'Test'}
              </button>
              <StatusPill connected={resendConnected} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Default from address">
              <input
                type="email"
                className={inputClass}
                placeholder="news@example.com"
                value={resendFromAddress}
                onChange={(e) => setResendFromAddress(e.target.value)}
              />
            </Field>
            <Field label="Default from name">
              <input
                type="text"
                className={inputClass}
                placeholder="Opzava"
                value={resendFromName}
                onChange={(e) => setResendFromName(e.target.value)}
              />
            </Field>
          </div>
          <EnvSecretNote envVar="RESEND_API_KEY" label="API key" />
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 px-3 py-2 rounded-md text-sm border ${
            testResult.ok
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
          }`}
        >
          <span className="font-medium capitalize">{testResult.provider}</span>: {testResult.message}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Save the non-secret fields, then Test — the test verifies the environment secret.
        </p>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save connections'}
        </Button>
      </div>
    </div>
  )
}
