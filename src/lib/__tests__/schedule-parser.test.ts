import { describe, it, expect } from 'vitest'
import { parseNaturalSchedule, isCronDue } from '../schedule-parser'

describe('parseNaturalSchedule', () => {
  it('returns null for empty input', () => {
    expect(parseNaturalSchedule('')).toBeNull()
    expect(parseNaturalSchedule('   ')).toBeNull()
  })

  it('passes through valid cron expressions', () => {
    const result = parseNaturalSchedule('0 9 * * *')
    expect(result).not.toBeNull()
    expect(result!.cronExpr).toBe('0 9 * * *')
    expect(result!.humanReadable).toContain('0 9 * * *')
  })

  it('passes through step cron expressions when formatted as pure cron', () => {
    // The CRON_REGEX requires each field to be * or digits/commas/ranges.
    // "*/5 * * * *" has a mixed field so it falls through as null (natural language fallback)
    // Instead test a valid 5-field numeric cron:
    const result = parseNaturalSchedule('5 * * * *')
    expect(result!.cronExpr).toBe('5 * * * *')
  })

  it('parses "hourly"', () => {
    const result = parseNaturalSchedule('hourly')
    expect(result!.cronExpr).toBe('0 * * * *')
    expect(result!.humanReadable).toMatch(/every hour/i)
  })

  it('parses "daily"', () => {
    const result = parseNaturalSchedule('daily')
    expect(result!.cronExpr).toBe('0 9 * * *')
  })

  it('parses "every day"', () => {
    const result = parseNaturalSchedule('every day')
    expect(result!.cronExpr).toBe('0 9 * * *')
  })

  it('parses "weekly"', () => {
    const result = parseNaturalSchedule('weekly')
    expect(result!.cronExpr).toBe('0 9 * * 1')
    expect(result!.humanReadable).toMatch(/monday/i)
  })

  it('parses "every N minutes"', () => {
    expect(parseNaturalSchedule('every 5 minutes')!.cronExpr).toBe('*/5 * * * *')
    expect(parseNaturalSchedule('every 1 minute')!.cronExpr).toBe('*/1 * * * *')
    expect(parseNaturalSchedule('every 30 minutes')!.cronExpr).toBe('*/30 * * * *')
  })

  it('returns null for invalid minute intervals', () => {
    expect(parseNaturalSchedule('every 0 minutes')).toBeNull()
    expect(parseNaturalSchedule('every 60 minutes')).toBeNull()
  })

  it('parses "every N hours"', () => {
    expect(parseNaturalSchedule('every 2 hours')!.cronExpr).toBe('0 */2 * * *')
    expect(parseNaturalSchedule('every 1 hour')!.cronExpr).toBe('0 */1 * * *')
  })

  it('returns null for invalid hour intervals', () => {
    expect(parseNaturalSchedule('every 0 hours')).toBeNull()
    expect(parseNaturalSchedule('every 24 hours')).toBeNull()
  })

  it('parses "daily at TIME"', () => {
    const result = parseNaturalSchedule('daily at 9am')
    expect(result!.cronExpr).toBe('0 9 * * *')
    expect(result!.humanReadable).toMatch(/9.*AM/i)
  })

  it('parses "every morning at TIME"', () => {
    const result = parseNaturalSchedule('every morning at 8am')
    expect(result!.cronExpr).toBe('0 8 * * *')
  })

  it('parses "every evening at TIME"', () => {
    const result = parseNaturalSchedule('every evening at 6pm')
    expect(result!.cronExpr).toBe('0 18 * * *')
  })

  it('parses time with minutes', () => {
    const result = parseNaturalSchedule('daily at 9:30am')
    expect(result!.cronExpr).toBe('30 9 * * *')
    expect(result!.humanReadable).toMatch(/9:30/i)
  })

  it('parses "at TIME every day"', () => {
    const result = parseNaturalSchedule('at 10am every day')
    expect(result!.cronExpr).toBe('0 10 * * *')
  })

  it('parses "weekly on DAYNAME"', () => {
    expect(parseNaturalSchedule('weekly on monday')!.cronExpr).toBe('0 9 * * 1')
    expect(parseNaturalSchedule('weekly on friday')!.cronExpr).toBe('0 9 * * 5')
    expect(parseNaturalSchedule('weekly on sunday')!.cronExpr).toBe('0 9 * * 0')
  })

  it('parses "every DAYNAME"', () => {
    expect(parseNaturalSchedule('every monday')!.cronExpr).toBe('0 9 * * 1')
    expect(parseNaturalSchedule('every saturday')!.cronExpr).toBe('0 9 * * 6')
  })

  it('parses "every DAYNAME at TIME"', () => {
    const result = parseNaturalSchedule('every tuesday at 3pm')
    expect(result!.cronExpr).toBe('0 15 * * 2')
    expect(result!.humanReadable).toMatch(/tuesday/i)
    expect(result!.humanReadable).toMatch(/3.*PM/i)
  })

  it('returns null for unrecognized input', () => {
    expect(parseNaturalSchedule('some random text')).toBeNull()
    expect(parseNaturalSchedule('every foo bar')).toBeNull()
  })

  it('handles abbreviated day names', () => {
    expect(parseNaturalSchedule('every mon')!.cronExpr).toBe('0 9 * * 1')
    expect(parseNaturalSchedule('every fri')!.cronExpr).toBe('0 9 * * 5')
  })

  it('parses pm time correctly (12pm = noon)', () => {
    const result = parseNaturalSchedule('daily at 12pm')
    expect(result!.cronExpr).toBe('0 12 * * *')
  })

  it('parses 12am as midnight', () => {
    const result = parseNaturalSchedule('daily at 12am')
    expect(result!.cronExpr).toBe('0 0 * * *')
  })

  // --- Exact humanReadable output (pins the label/cron string literals) ---
  it.each([
    ['hourly', '0 * * * *', 'Every hour'],
    ['daily', '0 9 * * *', 'Daily at 9:00 AM'],
    ['every day', '0 9 * * *', 'Daily at 9:00 AM'],
    ['weekly', '0 9 * * 1', 'Weekly on Monday at 9:00 AM'],
    ['every 5 minutes', '*/5 * * * *', 'Every 5 minutes'],
    ['every 1 minute', '*/1 * * * *', 'Every 1 minute'],
    ['every 2 hours', '0 */2 * * *', 'Every 2 hours'],
    ['every 1 hour', '0 */1 * * *', 'Every 1 hour'],
    ['daily at 9am', '0 9 * * *', 'Daily at 9 AM'],
    ['daily at 9:30am', '30 9 * * *', 'Daily at 9:30 AM'],
    ['daily at 12pm', '0 12 * * *', 'Daily at 12 PM'],
    ['daily at 12am', '0 0 * * *', 'Daily at 12 AM'],
    ['at 10am every day', '0 10 * * *', 'Daily at 10 AM'],
    ['weekly on friday', '0 9 * * 5', 'Weekly on Friday at 9:00 AM'],
    ['every tuesday at 3pm', '0 15 * * 2', 'Every Tuesday at 3 PM'],
    ['every monday at 6:05am', '5 6 * * 1', 'Every Monday at 6:05 AM'],
  ] as const)('produces exact output for %s', (input, cronExpr, humanReadable) => {
    expect(parseNaturalSchedule(input)).toEqual({ cronExpr, humanReadable })
  })

  it('labels a raw cron passthrough exactly', () => {
    expect(parseNaturalSchedule('5 * * * *')).toEqual({
      cronExpr: '5 * * * *',
      humanReadable: 'Custom schedule (5 * * * *)',
    })
  })

  // --- Numeric interval boundaries (pins n>0 / n<=59 / n<=23 guards) ---
  it('accepts the inclusive upper bounds of minute/hour intervals', () => {
    expect(parseNaturalSchedule('every 59 minutes')!.cronExpr).toBe('*/59 * * * *')
    expect(parseNaturalSchedule('every 23 hours')!.cronExpr).toBe('0 */23 * * *')
  })

  // --- Time-expression validation (via the public parser) ---
  it.each([
    'daily at 9:60am', // minute > 59
    'daily at 9:99am',
    'daily at 24', // hour > 23
    'daily at 25',
  ])('rejects out-of-range time %s', (input) => {
    expect(parseNaturalSchedule(input)).toBeNull()
  })

  it('parses bare 24-hour times', () => {
    expect(parseNaturalSchedule('daily at 14:00')!.cronExpr).toBe('0 14 * * *')
    expect(parseNaturalSchedule('daily at 0')!.cronExpr).toBe('0 0 * * *')
    expect(parseNaturalSchedule('daily at 23')!.cronExpr).toBe('0 23 * * *')
  })

  it('rejects an unknown day name in weekly/every patterns', () => {
    expect(parseNaturalSchedule('weekly on funday')).toBeNull()
    expect(parseNaturalSchedule('every someday at 9am')).toBeNull()
  })

  it('trims surrounding whitespace before matching', () => {
    expect(parseNaturalSchedule('  hourly  ')!.cronExpr).toBe('0 * * * *')
  })

  it('returns null (no throw) for an "at TIME" phrase whose time does not parse', () => {
    expect(parseNaturalSchedule('daily at noon')).toBeNull()
    expect(parseNaturalSchedule('at noon every day')).toBeNull()
    expect(parseNaturalSchedule('every monday at noon')).toBeNull()
  })

  it('accepts minute 59 (inclusive upper bound of the minute field)', () => {
    expect(parseNaturalSchedule('daily at 9:59am')!.cronExpr).toBe('59 9 * * *')
  })

  it('zero-pads single-digit minutes in the readable label', () => {
    expect(parseNaturalSchedule('daily at 9:05am')).toEqual({
      cronExpr: '5 9 * * *',
      humanReadable: 'Daily at 9:05 AM',
    })
  })

  it('renders the "at TIME every day" branch with minutes and PM', () => {
    expect(parseNaturalSchedule('at 2:30pm every day')).toEqual({
      cronExpr: '30 14 * * *',
      humanReadable: 'Daily at 2:30 PM',
    })
  })

  it('labels noon as 12 PM in the per-day branch (hour<12 boundary)', () => {
    expect(parseNaturalSchedule('every monday at 12pm')).toEqual({
      cronExpr: '0 12 * * 1',
      humanReadable: 'Every Monday at 12 PM',
    })
  })

  it('labels noon as 12 PM in the "at TIME every day" branch', () => {
    expect(parseNaturalSchedule('at 12pm every day')).toEqual({
      cronExpr: '0 12 * * *',
      humanReadable: 'Daily at 12 PM',
    })
  })

  it('zero-pads single-digit minutes in the "at TIME every day" branch', () => {
    expect(parseNaturalSchedule('at 2:05pm every day')).toEqual({
      cronExpr: '5 14 * * *',
      humanReadable: 'Daily at 2:05 PM',
    })
  })

  // --- Raw-cron passthrough regex: every field exercised with digits/lists/ranges,
  //     and the start/end anchors enforced (pins CRON_REGEX). ---
  it('passes through a cron using digits, lists, and ranges in every field', () => {
    const cron = '1-5 0,30 1,15 10,20 1-5'
    expect(parseNaturalSchedule(cron)).toEqual({
      cronExpr: cron,
      humanReadable: `Custom schedule (${cron})`,
    })
  })

  it('accepts multi-space separators between cron fields', () => {
    expect(parseNaturalSchedule('0  9  *  *  *')!.cronExpr).toBe('0  9  *  *  *')
  })

  it('does not treat a string with junk around a cron as a cron (anchors)', () => {
    expect(parseNaturalSchedule('junk 0 9 * * *')).toBeNull() // leading junk → ^ anchor
    expect(parseNaturalSchedule('0 9 * * * junk')).toBeNull() // trailing junk → $ anchor
  })

  // The NL patterns are start/end anchored — a valid phrase embedded in junk must
  // not match (pins the ^ and $ anchors on each pattern regex).
  it.each([
    'do every 5 minutes',
    'every 5 minutes please',
    'do every 2 hours',
    'every 2 hours please',
    'please daily at 9am',
    'do every monday',
    'every monday please',
    'do every tuesday at 3pm',
    'go at 10am every day',
  ])('rejects a valid phrase embedded in junk: %s', (input) => {
    expect(parseNaturalSchedule(input)).toBeNull()
  })

  // `\s+` separators tolerate (and require ≥1) whitespace — multi-space phrasing
  // must still parse (pins the \s+ quantifiers against a collapse to \s).
  it.each([
    ['every  5  minutes', '*/5 * * * *'],
    ['every  2  hours', '0 */2 * * *'],
    ['daily  at  9am', '0 9 * * *'],
    ['every  monday', '0 9 * * 1'],
    ['every  tuesday  at  3pm', '0 15 * * 2'],
    ['every  morning at 8am', '0 8 * * *'], // \s+ inside the morning/evening/day group
    ['at  10am every day', '0 10 * * *'], // \s+ after the leading "at"
    ['at 10am  every day', '0 10 * * *'], // \s+ before "every"
    ['at 10am every  day', '0 10 * * *'], // \s+ before "day"
    ['weekly  on monday', '0 9 * * 1'], // \s+ inside "weekly on"
  ] as const)('tolerates multi-space separators in %s', (input, cronExpr) => {
    expect(parseNaturalSchedule(input)!.cronExpr).toBe(cronExpr)
  })

  it('anchors the time sub-parser (no junk before/after the time)', () => {
    expect(parseNaturalSchedule('daily at x9am')).toBeNull() // junk before the time → ^
    expect(parseNaturalSchedule('daily at 9am zzz')).toBeNull() // junk after the time → $
  })

  it('requires the "every day" suffix to terminate the "at TIME every day" phrase', () => {
    expect(parseNaturalSchedule('at 10am every day extra')).toBeNull()
  })

  it('maps every weekday name and abbreviation to its cron number', () => {
    const cases: Array<[string, number]> = [
      ['sunday', 0], ['sun', 0], ['monday', 1], ['mon', 1], ['tuesday', 2], ['tue', 2],
      ['wednesday', 3], ['wed', 3], ['thursday', 4], ['thu', 4], ['friday', 5], ['fri', 5],
      ['saturday', 6], ['sat', 6],
    ]
    for (const [name, num] of cases) {
      expect(parseNaturalSchedule(`every ${name}`)!.cronExpr).toBe(`0 9 * * ${num}`)
    }
  })
})

describe('isCronDue — field and dedupe edge cases', () => {
  function localTime(dayOfWeek: number, hour: number, minute: number): number {
    const d = new Date()
    d.setSeconds(0); d.setMilliseconds(0); d.setMinutes(minute); d.setHours(hour)
    d.setDate(d.getDate() + (dayOfWeek - d.getDay()))
    return d.getTime()
  }

  it('rejects a non-positive step (*/0)', () => {
    const t = localTime(1, 9, 0)
    expect(isCronDue('*/0 * * * *', t, 0)).toBe(false)
  })

  it('treats range boundaries as inclusive', () => {
    expect(isCronDue('0 9-17 * * *', localTime(1, 9, 0), 0)).toBe(true) // lower bound
    expect(isCronDue('0 9-17 * * *', localTime(1, 17, 0), 0)).toBe(true) // upper bound
    expect(isCronDue('0 9-17 * * *', localTime(1, 8, 0), 0)).toBe(false)
  })

  it('only suppresses a duplicate within the exact same calendar minute', () => {
    const now = new Date(2026, 5, 15, 9, 30, 40).getTime() // Mon Jun 15 2026 09:30:40
    // Same minute → suppressed
    expect(isCronDue('* * * * *', now, new Date(2026, 5, 15, 9, 30, 5).getTime())).toBe(false)
    // Differ by exactly one field each → must NOT be suppressed
    expect(isCronDue('* * * * *', now, new Date(2025, 5, 15, 9, 30, 5).getTime())).toBe(true) // year
    expect(isCronDue('* * * * *', now, new Date(2026, 4, 15, 9, 30, 5).getTime())).toBe(true) // month
    expect(isCronDue('* * * * *', now, new Date(2026, 5, 14, 9, 30, 5).getTime())).toBe(true) // date
    expect(isCronDue('* * * * *', now, new Date(2026, 5, 15, 8, 30, 5).getTime())).toBe(true) // hour
    expect(isCronDue('* * * * *', now, new Date(2026, 5, 15, 9, 29, 5).getTime())).toBe(true) // minute
  })

  it('does not run the dedupe check when lastSpawnedAtMs is 0', () => {
    const now = new Date(2026, 5, 15, 9, 30, 0).getTime()
    expect(isCronDue('* * * * *', now, 0)).toBe(true)
  })

  it('splits cron fields on runs of whitespace, not a single space', () => {
    // A double-spaced cron must still parse into exactly 5 fields and evaluate.
    expect(isCronDue('0  9  *  *  1', localTime(1, 9, 0), 0)).toBe(true)
  })
})

describe('isCronDue', () => {
  // Build a local-time date for Monday at a specific hour/minute
  // isCronDue uses .getHours()/.getMinutes()/.getDay() which are local time methods
  function makeLocalTime(dayOfWeek: number, hour: number, minute: number, second = 0): number {
    // Find a date that has the right local day of week
    const d = new Date()
    d.setSeconds(second)
    d.setMilliseconds(0)
    d.setMinutes(minute)
    d.setHours(hour)
    // Move to the desired day of week
    const diff = dayOfWeek - d.getDay()
    d.setDate(d.getDate() + diff)
    return d.getTime()
  }

  it('returns true when cron matches and not recently spawned', () => {
    const t = makeLocalTime(1, 9, 0) // Monday 09:00 local
    expect(isCronDue('0 9 * * 1', t, 0)).toBe(true)
  })

  it('returns true for * in all fields', () => {
    const t = makeLocalTime(1, 9, 0)
    expect(isCronDue('* * * * *', t, 0)).toBe(true)
  })

  it('returns false when minute does not match', () => {
    const t = makeLocalTime(1, 9, 5) // Monday 09:05
    expect(isCronDue('0 9 * * 1', t, 0)).toBe(false)
  })

  it('returns false when hour does not match', () => {
    const t = makeLocalTime(1, 10, 0) // Monday 10:00
    expect(isCronDue('0 9 * * 1', t, 0)).toBe(false)
  })

  it('returns false when day of week does not match', () => {
    const t = makeLocalTime(2, 9, 0) // Tuesday 09:00
    expect(isCronDue('0 9 * * 1', t, 0)).toBe(false) // Monday only
  })

  it('returns false if already spawned in same minute', () => {
    const t = makeLocalTime(1, 9, 0, 45) // Monday 09:00:45
    const spawnedJustNow = t - 30000 // 30s ago = 09:00:15, same minute
    expect(isCronDue('0 9 * * 1', t, spawnedJustNow)).toBe(false)
  })

  it('returns true if spawned in a previous minute', () => {
    const t = makeLocalTime(1, 9, 0)
    const spawnedPrevMinute = t - 120000 // 2 min ago, different minute
    expect(isCronDue('0 9 * * 1', t, spawnedPrevMinute)).toBe(true)
  })

  it('handles step expressions', () => {
    const t30 = makeLocalTime(1, 9, 30)
    expect(isCronDue('*/30 * * * *', t30, 0)).toBe(true)
    expect(isCronDue('*/15 * * * *', t30, 0)).toBe(true)
    expect(isCronDue('*/7 * * * *', t30, 0)).toBe(false) // 30 % 7 != 0
  })

  it('returns false for invalid cron expression', () => {
    const t = makeLocalTime(1, 9, 0)
    expect(isCronDue('invalid', t, 0)).toBe(false)
    expect(isCronDue('0 9 * *', t, 0)).toBe(false) // only 4 parts
  })

  it('handles comma-separated values', () => {
    const t9 = makeLocalTime(1, 9, 0)
    const t10 = makeLocalTime(1, 10, 0)
    expect(isCronDue('0 9,10 * * *', t9, 0)).toBe(true)
    expect(isCronDue('0 9,10 * * *', t10, 0)).toBe(true)
  })

  it('handles range expressions', () => {
    const t9 = makeLocalTime(1, 9, 0)
    const t18 = makeLocalTime(1, 18, 0)
    expect(isCronDue('0 9-17 * * *', t9, 0)).toBe(true)
    expect(isCronDue('0 9-17 * * *', t18, 0)).toBe(false)
  })

  // F11: day-of-month and month fields were silently dropped (only min/hour/dow were checked),
  // so a date-constrained cron over-fired. These assert all five fields are honoured.
  it('honours the day-of-month field', () => {
    const firstAtMidnight = new Date(2026, 0, 1, 0, 0, 0).getTime() // Jan 1 2026 00:00 local
    const secondAtMidnight = new Date(2026, 0, 2, 0, 0, 0).getTime() // Jan 2 2026 00:00 local
    expect(isCronDue('0 0 1 * *', firstAtMidnight, 0)).toBe(true)
    expect(isCronDue('0 0 1 * *', secondAtMidnight, 0)).toBe(false)
  })

  it('honours the month field', () => {
    const janFirst = new Date(2026, 0, 1, 0, 0, 0).getTime() // Jan 1
    const febFirst = new Date(2026, 1, 1, 0, 0, 0).getTime() // Feb 1
    expect(isCronDue('0 0 1 1 *', janFirst, 0)).toBe(true) // January only
    expect(isCronDue('0 0 1 1 *', febFirst, 0)).toBe(false)
  })

  it('uses OR semantics when both day-of-month and day-of-week are restricted', () => {
    // "0 0 13 * 5" = midnight on the 13th OR any Friday (standard Vixie-cron semantics).
    const friNot13 = new Date(2026, 0, 2, 0, 0, 0) // Fri Jan 2 2026 (Friday, not the 13th)
    const the13thNotFri = new Date(2026, 0, 13, 0, 0, 0) // Tue Jan 13 2026 (13th, not Friday)
    const neither = new Date(2026, 0, 6, 0, 0, 0) // Tue Jan 6 2026 (not 13th, not Friday)
    // self-checking preconditions
    expect(friNot13.getDay()).toBe(5)
    expect(the13thNotFri.getDate()).toBe(13)
    expect(the13thNotFri.getDay()).not.toBe(5)
    expect(isCronDue('0 0 13 * 5', friNot13.getTime(), 0)).toBe(true)
    expect(isCronDue('0 0 13 * 5', the13thNotFri.getTime(), 0)).toBe(true)
    expect(isCronDue('0 0 13 * 5', neither.getTime(), 0)).toBe(false)
  })

  it('matches only the day-of-month when day-of-week is wildcard', () => {
    const friNot13 = new Date(2026, 0, 2, 0, 0, 0).getTime() // Friday, not the 13th
    const the13th = new Date(2026, 0, 13, 0, 0, 0).getTime()
    expect(isCronDue('0 0 13 * *', friNot13, 0)).toBe(false)
    expect(isCronDue('0 0 13 * *', the13th, 0)).toBe(true)
  })
})
