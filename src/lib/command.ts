import { spawn } from 'node:child_process'
import path from 'node:path'
import { config } from './config'

interface CommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  onData?: (chunk: string) => void
}

interface CommandResult {
  stdout: string
  stderr: string
  code: number | null
}

function isOpenClawCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase()
  const normalized = base.replace(/\.(cmd|exe|mjs|js)$/i, '')
  return normalized === 'openclaw'
}

function createOpenClawDockerOnlyError(args: string[]): Error {
  const error = new Error(
    `Local OpenClaw CLI execution is disabled in Opzava. Use the mc-openclaw-gateway Docker sidecar and gateway API instead. Refused: openclaw ${args.join(' ')}`
  )
  ;(error as any).code = 'OPENCLAW_DOCKER_ONLY'
  return error
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  if (isOpenClawCommand(command)) {
    return Promise.reject(createOpenClawDockerOnlyError(args))
  }

  return new Promise((resolve, reject) => {
    const spawnCommand = path.extname(command).toLowerCase() === '.mjs' ? process.execPath : command
    const spawnArgs = spawnCommand === process.execPath ? [command, ...args] : args
    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let timeoutId: NodeJS.Timeout | undefined
    let timedOut = false

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, options.timeoutMs)
    }

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      options.onData?.(chunk)
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      options.onData?.(chunk)
    })

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId)

      const enoent = error as NodeJS.ErrnoException
      if (enoent?.code === 'ENOENT') {
        const binHint =
          command === config.clawdbotBin
              ? 'CLAWDBOT_BIN'
              : `${command.toUpperCase()}_BIN`
        const friendly = new Error(
          `Command not found: ${command}. Install it and ensure it is on PATH, or set ${binHint} to an absolute executable path.`
        )
        ;(friendly as any).code = enoent.code
        reject(friendly)
        return
      }

      reject(error)
    })

    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      if (timedOut) {
        const error = new Error(
          `Command timed out after ${options.timeoutMs}ms (${command} ${args.join(' ')}): ${stderr || stdout}`
        )
        ;(error as any).stdout = stdout
        ;(error as any).stderr = stderr
        ;(error as any).code = code
        ;(error as any).timedOut = true
        reject(error)
        return
      }
      const error = new Error(
        `Command failed (${command} ${args.join(' ')}): ${stderr || stdout}`
      )
      ;(error as any).stdout = stdout
      ;(error as any).stderr = stderr
      ;(error as any).code = code
      reject(error)
    })

    if (options.input) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}

export function runOpenClaw(args: string[], options: CommandOptions = {}) {
  void options
  return Promise.reject(createOpenClawDockerOnlyError(args))
}

export function runClawdbot(args: string[], options: CommandOptions = {}) {
  return runCommand(config.clawdbotBin, args, {
    ...options,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}
