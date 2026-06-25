import type { ReviewVerdict } from '@/opzava/core/workflow-engine/contracts'

import type { ReviewInput } from './contracts'

const MAX_OUTPUT_CHARS = 6000
const MAX_FEEDBACK_CHARS = 2000

/**
 * Build the Aegis review prompt for a reviewable unit. The model is instructed to answer in a
 * strict two-line format (`VERDICT:` + `NOTES:`) that `parseReviewVerdict` matches structurally.
 * Untrusted `output` is bounded; the structural parser (not the prompt) is the injection defense.
 */
export function buildReviewPrompt(input: ReviewInput): string {
  const lines = [
    'You are Aegis, the quality reviewer for Opzava.',
    'Review the following completed work and its output.',
    '',
    `**[${input.ref ?? input.title}] ${input.title}**`,
  ]

  if (input.description) {
    lines.push('', '## Intent', input.description)
  }

  lines.push('', '## Output Under Review', input.output.substring(0, MAX_OUTPUT_CHARS))

  lines.push(
    '',
    '## Instructions',
    'Evaluate whether the output adequately addresses the intent.',
    'Respond with EXACTLY one of these two formats (the VERDICT line FIRST, on its own line):',
    '',
    'VERDICT: APPROVED',
    'NOTES: <brief summary of why it passes>',
    '',
    'VERDICT: REJECTED',
    'NOTES: <specific issues that need to be fixed>',
  )

  return lines.join('\n')
}

/**
 * Parse a model's review reply into a `ReviewVerdict`. SECURITY (B2): match `VERDICT: APPROVED|
 * REJECTED` anchored to the START of a line — never a substring — and **default-DENY**: any reply
 * that omits the verdict, or that echoed an injected `VERDICT: APPROVED` mid-paragraph from
 * untrusted task content, is REJECTED (`valid: false`).
 */
export function parseReviewVerdict(text: string): ReviewVerdict {
  // Anchored to a line start (`m` flag), case-insensitive — NOT a substring anywhere.
  const verdictLine = text.match(/^[ \t]*VERDICT:[ \t]*(APPROVED|REJECTED)\b/im)
  const valid = verdictLine?.[1]?.toUpperCase() === 'APPROVED'
  const notesMatch = text.match(/^[ \t]*NOTES:[ \t]*(.+)/im)
  const feedback =
    notesMatch?.[1]?.trim().substring(0, MAX_FEEDBACK_CHARS) ||
    (valid ? 'Quality check passed' : 'Quality check failed')
  return { valid, feedback }
}
