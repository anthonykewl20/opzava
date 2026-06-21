import { parseFactCheckReport } from '../contracts/fact-check-report'
import { parseBrandReview } from '../contracts/brand-review'
import { parseAntiSlopReview } from '../contracts/anti-slop-review'

/**
 * The three automated content quality gates — fact-check, brand review, anti-slop — record a verdict
 * but were never enforced (F3): a `failed` / `changes-requested` / `rejected` verdict flowed straight
 * through to the WordPress draft. This is the single place that turns those recorded verdicts into a
 * hard stop, so a draft can only be produced when all three passed.
 *
 * A gate passes iff its artifact's `status === 'passed'`:
 *   fact-check:  passed | failed
 *   brand:       passed | changes-requested
 *   anti-slop:   passed | rejected
 */
export type ContentQualityGateInput = Readonly<{
  factCheck: unknown
  brandReview: unknown
  antiSlop: unknown
}>

export type ContentQualityGateFailure = Readonly<{ gate: string; status: string }>

export function evaluateContentQualityGates(input: ContentQualityGateInput): ContentQualityGateFailure[] {
  const failures: ContentQualityGateFailure[] = []

  const factCheck = parseFactCheckReport(input.factCheck)
  if (factCheck.status !== 'passed') failures.push({ gate: 'fact-check', status: factCheck.status })

  const brandReview = parseBrandReview(input.brandReview)
  if (brandReview.status !== 'passed') failures.push({ gate: 'brand-review', status: brandReview.status })

  const antiSlop = parseAntiSlopReview(input.antiSlop)
  if (antiSlop.status !== 'passed') failures.push({ gate: 'anti-slop-review', status: antiSlop.status })

  return failures
}

export function assertContentQualityGatesPassed(input: ContentQualityGateInput): void {
  const failures = evaluateContentQualityGates(input)
  if (failures.length > 0) {
    const summary = failures.map((f) => `${f.gate}=${f.status}`).join(', ')
    throw new Error(`content workflow halted: quality gates not passed (${summary}); WordPress draft refused`)
  }
}
