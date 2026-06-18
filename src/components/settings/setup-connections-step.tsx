'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ProviderConnectionsSection } from '@/components/settings/provider-connections-section'

interface Props {
  // Called when the operator finishes (after saving) or skips this step.
  onFinish: () => void
}

// Optional onboarding step: capture WordPress + Resend provider connections right after
// the admin account is created. Reuses ProviderConnectionsSection (which saves to /api/settings).
// Skippable — the workflow stays draft-only / mock until connections are configured.
export function SetupConnectionsStep({ onFinish }: Props) {
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [leaving, setLeaving] = useState(false)

  const showFeedback = (ok: boolean, text: string) => setFeedback({ ok, text })

  const finish = () => {
    setLeaving(true)
    onFinish()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-background border border-border/50 flex items-center justify-center mb-3">
            <Image
              src="/brand/mc-logo-128.png"
              alt="Opzava logo"
              width={48}
              height={48}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Connect your providers</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Optional. Add WordPress and Resend now, or skip and configure them later in Settings.
          </p>
        </div>

        <ProviderConnectionsSection showFeedback={showFeedback} />

        {feedback && (
          <div
            className={`mt-3 px-3 py-2 rounded-md text-sm border ${
              feedback.ok
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-destructive/20 bg-destructive/10 text-destructive'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            disabled={leaving}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
          <Button onClick={finish} disabled={leaving}>
            {leaving ? 'Continuing…' : 'Continue to dashboard'}
          </Button>
        </div>
      </div>
    </div>
  )
}
