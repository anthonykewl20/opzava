import { writeFile, rename } from 'node:fs/promises'

/**
 * Write a file atomically: write the full payload to a sibling `.tmp` file,
 * then `rename` it over the destination. `rename` within the same directory is
 * atomic on POSIX, so a crash mid-write can leave a stale `.tmp` behind but
 * never truncates the destination — readers always see either the fully-old or
 * the fully-new file.
 *
 * Shared by cron (jobs.json/runs.json) and integrations (.env) persistence,
 * extracted from the temp-write-rename pattern in integrations/route.ts.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, data, encoding)
  await rename(tmpPath, filePath)
}

export default writeFileAtomic
