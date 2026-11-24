/**
 * dsh-remote-shell — run shell commands on configured remote servers through
 * the system OpenSSH client and return bounded stdout/stderr to the model.
 *
 * A Host-only Cordis bundle with no runtime dependencies: it registers the
 * `remote_hosts` and `remote_exec` tools and keeps every tunable in the Loader
 * row config (see cordis.patch.yml). Authentication is key-based and
 * non-interactive (`BatchMode=yes`), so the configured private key must already
 * be in the remote user's ~/.ssh/authorized_keys.
 */

import { spawn } from 'node:child_process'
import { appendFileSync, createWriteStream, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Reported by the HTTP bridge so a stale page can be spotted. */
const PLUGIN_VERSION = '1.2.0'

/** Stable Loader identity. */
export const name = 'dsh-remote-shell'

/** Services used by the tools. */
export const inject = ['tools']

const DEFAULTS = {
  defaultTimeoutMs: 60_000,
  maxTimeoutMs: 600_000,
  maxOutputChars: 24_000,
  connectTimeoutSec: 10,
  approval: 'never',
  strictHostKeyChecking: 'yes',
  sshExecutable: 'ssh',
  defaultShell: '/bin/bash',
}

const APPROVAL_MODES = ['never', 'always']
const HOST_KEY_MODES = ['yes', 'accept-new', 'no']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function oneOf(value, allowed, fallback, label) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.map((entry) => `"${entry}"`).join(', ')}`)
  }
  return value
}

function integerOption(value, fallback, label, min, max) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`)
  }
  return value
}

function stringArray(value, label) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
  return value.map((entry) => entry.trim())
}

function compilePatterns(sources, label) {
  return sources.map((source) => {
    try {
      return new RegExp(source)
    } catch (error) {
      throw new Error(`${label} contains an invalid regular expression /${source}/: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function normalizeOptions(raw) {
  if (raw !== undefined && raw !== null && !isRecord(raw)) throw new Error('dsh-remote-shell config must be an object')
  const config = raw ?? {}
  const options = {
    defaultTimeoutMs: integerOption(config.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs, 'defaultTimeoutMs', 1_000, 86_400_000),
    maxTimeoutMs: integerOption(config.maxTimeoutMs, DEFAULTS.maxTimeoutMs, 'maxTimeoutMs', 1_000, 86_400_000),
    maxOutputChars: integerOption(config.maxOutputChars, DEFAULTS.maxOutputChars, 'maxOutputChars', 1_000, 4_000_000),
    approval: oneOf(config.approval, APPROVAL_MODES, DEFAULTS.approval, 'approval'),
    strictHostKeyChecking: oneOf(config.strictHostKeyChecking, HOST_KEY_MODES, DEFAULTS.strictHostKeyChecking, 'strictHostKeyChecking'),
    sshExecutable: config.sshExecutable === undefined ? DEFAULTS.sshExecutable : requireString(config.sshExecutable, 'sshExecutable'),
    defaultShell: config.defaultShell === undefined ? DEFAULTS.defaultShell : requireString(config.defaultShell, 'defaultShell'),
  }
  if (options.maxTimeoutMs < options.defaultTimeoutMs) throw new Error('maxTimeoutMs must be greater than or equal to defaultTimeoutMs')
  const connectTimeoutSec = integerOption(config.connectTimeoutSec, DEFAULTS.connectTimeoutSec, 'connectTimeoutSec', 1, 120)
  options.connectTimeoutSec = connectTimeoutSec

  const rawHosts = config.hosts === undefined ? [] : config.hosts
  if (!Array.isArray(rawHosts)) throw new Error('hosts must be an array')
  const seenNames = new Set()
  options.hosts = rawHosts.map((entry, index) => {
    const label = `hosts[${index}]`
    if (!isRecord(entry)) throw new Error(`${label} must be an object`)
    const hostName = requireString(entry.name ?? entry.id, `${label}.name`)
    if (!/^[A-Za-z0-9_.@-]+$/.test(hostName)) throw new Error(`${label}.name may only contain letters, digits, dot, dash, underscore and @`)
    if (seenNames.has(hostName)) throw new Error(`duplicate host name "${hostName}" in hosts[${index}]`)
    seenNames.add(hostName)
    const denyPatternSources = stringArray(entry.denyPatterns, `${label}.denyPatterns`)
    return {
      name: hostName,
      host: requireString(entry.host ?? entry.hostname ?? entry.address, `${label}.host`),
      user: entry.user === undefined ? 'root' : requireString(entry.user, `${label}.user`),
      port: integerOption(entry.port, 22, `${label}.port`, 1, 65535),
      identityFile: entry.identityFile === undefined ? undefined : requireString(entry.identityFile, `${label}.identityFile`),
      workdir: entry.workdir === undefined ? undefined : requireString(entry.workdir, `${label}.workdir`),
      shell: entry.shell === undefined ? options.defaultShell : requireString(entry.shell, `${label}.shell`),
      proxyJump: entry.proxyJump === undefined ? undefined : requireString(entry.proxyJump, `${label}.proxyJump`),
      connectTimeoutSec: integerOption(entry.connectTimeoutSec, connectTimeoutSec, `${label}.connectTimeoutSec`, 1, 120),
      extraOptions: stringArray(entry.extraOptions, `${label}.extraOptions`),
      denyPatternSources,
      denyPatterns: compilePatterns(denyPatternSources, `${label}.denyPatterns`),
    }
  })
  return options
}

function resolveHost(options, requested) {
  if (typeof requested !== 'string' || requested.trim().length === 0) {
    throw new Error('host must be a configured server alias from remote_hosts')
  }
  const candidate = requested.trim()
  const host = options.hosts.find((entry) => (
    entry.name === candidate
    || entry.host === candidate
    || `${entry.user}@${entry.host}` === candidate
  ))
  if (host !== undefined) return host
  const configured = options.hosts.length === 0 ? 'none' : options.hosts.map((entry) => entry.name).join(', ')
  throw new Error(`unknown host "${candidate}". Configured hosts: ${configured}. Call remote_hosts to list them.`)
}

/** Quote one string as a single POSIX shell word. */
function quotePosix(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

/** Quote a working directory so a leading `~` still expands while the rest stays literal. */
function quoteWorkdir(value) {
  const workdir = String(value)
  if (workdir === '~') return '~'
  const homeRelative = /^~(\/.*)$/.exec(workdir)
  if (homeRelative !== null) return `~${quotePosix(homeRelative[1])}`
  return quotePosix(workdir)
}

function buildRemoteCommand(host, workdir, command) {
  const login = `exec ${host.shell} -lc ${quotePosix(command)}`
  return workdir === undefined ? login : `cd ${quoteWorkdir(workdir)} && ${login}`
}

function buildSshArgs(options, host, remoteCommand) {
  const args = [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', `ConnectTimeout=${host.connectTimeoutSec}`,
    '-o', `StrictHostKeyChecking=${options.strictHostKeyChecking}`,
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
  ]
  if (host.identityFile !== undefined) args.push('-i', host.identityFile, '-o', 'IdentitiesOnly=yes')
  if (host.port !== 22) args.push('-p', String(host.port))
  if (host.proxyJump !== undefined) args.push('-J', host.proxyJump)
  for (const option of host.extraOptions) args.push('-o', option)
  args.push(`${host.user}@${host.host}`, remoteCommand)
  return args
}

/** Keep a bounded head and tail of one output stream while counting dropped characters. */
class BoundedText {
  constructor(limit) {
    this.headLimit = Math.ceil(limit / 2)
    this.tailLimit = Math.floor(limit / 2)
    this.head = ''
    this.tail = ''
    this.dropped = 0
  }

  push(chunk) {
    if (typeof chunk !== 'string' || chunk.length === 0) return
    if (this.head.length < this.headLimit) {
      const room = this.headLimit - this.head.length
      if (chunk.length <= room) {
        this.head += chunk
        return
      }
      this.head += chunk.slice(0, room)
      chunk = chunk.slice(room)
    }
    this.tail += chunk
    if (this.tail.length > this.tailLimit) {
      const overflow = this.tail.length - this.tailLimit
      this.dropped += overflow
      this.tail = this.tail.slice(overflow)
    }
  }

  text() {
    if (this.dropped === 0) return this.head + this.tail
    return `${this.head}\n[... ${this.dropped} characters truncated ...]\n${this.tail}`
  }
}

/** Stream the complete output into a temp file; best effort, never fatal. */
function openSpill() {
  try {
    const directory = join(tmpdir(), 'dsh-remote-shell')
    mkdirSync(directory, { recursive: true })
    const path = join(directory, `remote-${Date.now()}-${randomUUID().slice(0, 8)}.log`)
    const stream = createWriteStream(path, { flags: 'w' })
    stream.on('error', () => {})
    let closed = false
    return {
      path,
      write(channel, text) {
        if (closed) return
        try {
          stream.write(`\n--- ${channel} ---\n${text}`)
        } catch {}
      },
      end() {
        if (closed) return
        closed = true
        try {
          stream.end()
        } catch {}
      },
    }
  } catch {
    return { path: undefined, write() {}, end() {} }
  }
}

function runSsh(options, host, remoteCommand, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('remote_exec was aborted before the command started'))
      return
    }
    const startedAt = Date.now()
    let child
    try {
      child = spawn(options.sshExecutable, buildSshArgs(options, host, remoteCommand), {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(new Error(`failed to start SSH client "${options.sshExecutable}": ${error instanceof Error ? error.message : String(error)}`))
      return
    }

    const stdout = new BoundedText(options.maxOutputChars)
    const stderr = new BoundedText(options.maxOutputChars)
    const spill = openSpill()
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout.push(chunk)
      spill.write('stdout', chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr.push(chunk)
      spill.write('stderr', chunk)
    })

    let timedOut = false
    let aborted = false
    let closed = false
    let timer
    let forceTimer

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      if (forceTimer !== undefined) clearTimeout(forceTimer)
      signal?.removeEventListener('abort', onAbort)
    }
    const kill = () => {
      if (closed) return
      try {
        child.kill()
      } catch {}
      forceTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
      }, 3_000)
      forceTimer.unref?.()
    }
    const onAbort = () => {
      aborted = true
      kill()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        kill()
      }, timeoutMs)
      timer.unref?.()
    }

    child.once('error', (error) => {
      if (closed) return
      closed = true
      cleanup()
      spill.end()
      reject(new Error(`failed to run SSH client "${options.sshExecutable}": ${error instanceof Error ? error.message : String(error)}. Ensure OpenSSH is installed or set sshExecutable in the plugin config.`))
    })

    child.once('close', (code, sig) => {
      if (closed) return
      closed = true
      cleanup()
      spill.end()
      const truncated = stdout.dropped > 0 || stderr.dropped > 0
      resolve({
        exitCode: code,
        signal: sig ?? null,
        timedOut,
        aborted,
        durationMs: Date.now() - startedAt,
        stdout: { text: stdout.text(), truncated: stdout.dropped > 0 },
        stderr: { text: stderr.text(), truncated: stderr.dropped > 0 },
        spillPath: truncated ? spill.path : undefined,
      })
    })
  })
}

async function maybeApprove(ctx, options, host, command, exec) {
  if (options.approval !== 'always') return
  const approval = ctx.get('approval')
  if (approval === undefined || exec.agent === undefined) {
    throw new Error('approval is set to "always" but no approval service is available in this session; the command was not run')
  }
  const outcome = await approval.request({
    agent: exec.agent,
    toolName: 'remote_exec',
    callId: exec.callId,
    reason: `在 ${host.name} (${host.user}@${host.host}) 上执行：${command}`,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new Error(`remote_exec was not approved (${outcome}); the command was not run`)
  }
}

function clampTimeout(requested, options) {
  if (requested === undefined || requested === null) return options.defaultTimeoutMs
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) throw new Error('timeoutMs must be a positive number')
  return Math.min(Math.floor(requested), options.maxTimeoutMs)
}

function normalizeWorkdir(requested, host) {
  if (requested === undefined || requested === null) return host.workdir
  const workdir = requireString(requested, 'workdir')
  if (workdir === '~' || workdir.startsWith('~/') || workdir.startsWith('/') || host.workdir === undefined) return workdir
  return `${host.workdir.replace(/\/+$/, '')}/${workdir}`
}

function streamText(stream) {
  return typeof stream?.text === 'string' ? stream.text : ''
}

function renderRemoteExec(_args, value) {
  let body = streamText(value.stdout)
  const err = streamText(value.stderr)
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n'
    body += `[stderr]\n${err}`
  }
  if (body.length === 0) body = '(no output)'
  const markers = []
  if (value.stdout?.truncated || value.stderr?.truncated) {
    markers.push(`[output truncated; full output: ${value.spillPath ?? '(unavailable)'}]`)
  }
  if (value.timedOut) markers.push(`[timed out after ${value.timeoutMs}ms; the SSH client was killed, the remote command may still be running]`)
  if (value.aborted) markers.push('[aborted]')
  if (!value.timedOut && !value.aborted) {
    if (value.exitCode === 255) {
      markers.push('[ssh error: connection or authentication failed — verify the host is reachable, the known_hosts entry is current, and the configured identityFile is authorized]')
    } else if (value.signal !== null && value.signal !== undefined) {
      markers.push(`[killed by signal: ${value.signal}]`)
    } else if (typeof value.exitCode === 'number' && value.exitCode !== 0) {
      markers.push(`[exit code: ${value.exitCode}]`)
    }
  }
  if (markers.length === 0) return [{ type: 'text', text: body }]
  return [{ type: 'text', text: `${body.endsWith('\n') ? body : `${body}\n`}${markers.join('\n')}` }]
}

function renderRemoteHosts(_args, value) {
  if (value.hosts.length === 0) {
    return [{ type: 'text', text: 'No remote hosts are configured. Add entries to the dsh-remote-shell Loader row config (`hosts`).' }]
  }
  const lines = value.hosts.map((host) => {
    const workdir = host.workdir ?? "the remote user's home"
    const auth = host.keyAuth ? 'key auth configured' : 'default SSH key'
    return `- ${host.name}: ${host.target} (workdir ${workdir}, shell ${host.shell}, ${auth})`
  })
  return [{ type: 'text', text: lines.join('\n') }]
}

const RPC_PATH = '/dsh-remote-shell/rpc'
const RPC_BODY_LIMIT = 256 * 1024

function sendJson(response, status, value) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

async function readJsonRequestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > RPC_BODY_LIMIT) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Normalize a `host[:port]` authority onto one loopback identity. */
function loopbackAuthority(authority) {
  try {
    const parsed = new URL(`http://${authority}`)
    if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return undefined
    return `loopback:${parsed.port === '' ? '80' : parsed.port}`
  } catch {
    return undefined
  }
}

/**
 * Same-origin guard for the write route: the request Host must be the local
 * loopback listener, and a browser Origin must match it. Missing Origin is
 * accepted because only local native clients omit it and they can forge any
 * header anyway (the same rule the shipped plugin-market route uses); a JSON
 * content type additionally forces a CORS preflight for cross-site callers.
 */
function isTrustedRequest(request) {
  const host = request.headers.host
  const hostKey = host === undefined ? undefined : loopbackAuthority(host)
  if (hostKey === undefined) return false
  const origin = request.headers.origin
  if (origin === undefined || origin === '') return true
  try {
    const url = new URL(origin)
    if (url.protocol === 'dsh-app:') return true
    return loopbackAuthority(url.host) === hostKey
  } catch {
    return false
  }
}

/** Append one browser-side diagnostic line so the Host half can record UI mounts. */
function appendDiag(entry) {
  try {
    const directory = join(tmpdir(), 'dsh-remote-shell')
    mkdirSync(directory, { recursive: true })
    appendFileSync(join(directory, 'ui.log'), `${new Date().toISOString()} ${JSON.stringify(entry)}\n`)
  } catch {}
}

function uiHosts(options) {
  return options.hosts.map((host) => ({
    name: host.name,
    target: `${host.user}@${host.host}:${host.port}`,
    workdir: host.workdir ?? null,
    shell: host.shell,
    keyAuth: host.identityFile !== undefined,
    proxyJump: host.proxyJump ?? null,
  }))
}

/** The config-shaped host list the editor page loads and saves. */
function configHosts(options) {
  return options.hosts.map((host) => ({
    name: host.name,
    host: host.host,
    user: host.user,
    port: host.port,
    ...(host.identityFile === undefined ? {} : { identityFile: host.identityFile }),
    ...(host.workdir === undefined ? {} : { workdir: host.workdir }),
    shell: host.shell,
    ...(host.proxyJump === undefined ? {} : { proxyJump: host.proxyJump }),
    connectTimeoutSec: host.connectTimeoutSec,
    ...(host.extraOptions.length === 0 ? {} : { extraOptions: host.extraOptions }),
    ...(host.denyPatternSources.length === 0 ? {} : { denyPatterns: host.denyPatternSources }),
  }))
}

/** Global defaults shown on the editor page; hosts are edited separately. */
function configDefaults(options) {
  return {
    defaultTimeoutMs: options.defaultTimeoutMs,
    maxTimeoutMs: options.maxTimeoutMs,
    maxOutputChars: options.maxOutputChars,
    approval: options.approval,
    connectTimeoutSec: options.connectTimeoutSec,
    strictHostKeyChecking: options.strictHostKeyChecking,
    sshExecutable: options.sshExecutable,
    defaultShell: options.defaultShell,
  }
}

/** Build the same-origin JSON bridge used by the main-panel page (client half). */
function createRpcHandler(options, clientModulePath, configApi) {
  return async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST' })
      response.end()
      return
    }
    if (!isTrustedRequest(request)) {
      sendJson(response, 403, { ok: false, error: 'untrusted origin' })
      return
    }
    let payload
    try {
      payload = await readJsonRequestBody(request)
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    const method = isRecord(payload) ? payload.method : undefined
    const params = isRecord(payload) && isRecord(payload.params) ? payload.params : {}
    try {
      switch (method) {
        case 'ping':
          sendJson(response, 200, { ok: true, value: { version: PLUGIN_VERSION, hosts: options.hosts.length, clientModule: clientModulePath() } })
          return
        case 'hosts':
          sendJson(response, 200, { ok: true, value: { hosts: uiHosts(options) } })
          return
        case 'config':
          sendJson(response, 200, { ok: true, value: {
            editable: configApi.available(),
            hosts: configHosts(options),
            defaults: configDefaults(options),
          } })
          return
        case 'saveHosts': {
          if (!configApi.available()) throw new Error('this profile cannot persist plugin configuration: the Loader entry or configEditor service is unavailable')
          if (!Array.isArray(params.hosts)) throw new Error('hosts must be an array')
          await configApi.saveHosts(params.hosts)
          sendJson(response, 200, { ok: true, value: { saved: true, hosts: params.hosts.length } })
          return
        }
        case 'run': {
          const host = resolveHost(options, params.host)
          const command = requireString(params.command, 'command')
          for (const pattern of host.denyPatterns) {
            if (pattern.test(command)) throw new Error(`command blocked by host "${host.name}" deny pattern /${pattern.source}/`)
          }
          const timeoutMs = clampTimeout(params.timeoutMs, options)
          const workdir = normalizeWorkdir(params.workdir, host)
          const remoteCommand = buildRemoteCommand(host, workdir, command)
          const result = await runSsh(options, host, remoteCommand, timeoutMs)
          sendJson(response, 200, {
            ok: true,
            value: {
              host: host.name,
              target: `${host.user}@${host.host}`,
              command,
              workdir: workdir ?? null,
              exitCode: result.exitCode,
              signal: result.signal,
              timedOut: result.timedOut,
              durationMs: result.durationMs,
              timeoutMs,
              stdout: result.stdout,
              stderr: result.stderr,
              ...(result.spillPath === undefined ? {} : { spillPath: result.spillPath }),
            },
          })
          return
        }
        case 'diag':
          appendDiag(params)
          sendJson(response, 200, { ok: true, value: { logged: true } })
          return
        default:
          sendJson(response, 400, { ok: false, error: `unknown method "${String(method)}"` })
      }
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function createHostsTool(options) {
  return {
    name: 'remote_hosts',
    description: "List the remote servers this session may reach with remote_exec. Pass one entry's name as the `host` argument; only configured servers are accepted, never arbitrary hostnames.",
    parameters: {
      type: 'object',
      properties: {},
    },
    output: { schema: {}, render: renderRemoteHosts },
    async execute() {
      return {
        hosts: options.hosts.map((host) => ({
          name: host.name,
          target: `${host.user}@${host.host}:${host.port}`,
          workdir: host.workdir ?? null,
          shell: host.shell,
          keyAuth: host.identityFile !== undefined,
          proxyJump: host.proxyJump ?? null,
        })),
      }
    },
  }
}

function createExecTool(ctx, options) {
  const hostNames = options.hosts.map((host) => host.name).join(', ')
  const description = [
    'Run a shell command on a configured remote server over SSH and return its stdout/stderr.',
    `Only hosts listed by remote_hosts are reachable${hostNames.length > 0 ? ` (${hostNames})` : ''}; each call opens a new SSH connection and runs non-interactively.`,
    "Commands run in a login shell inside the host's workdir (override with workdir). Prefer non-interactive commands: full-screen programs such as top, vim or less hang until the timeout.",
    'Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on.',
    `Output is capped near ${options.maxOutputChars} characters with head and tail; when truncated the full output path is reported.`,
    'Confirm destructive commands (deleting data, restarting services, overwriting files) with the user before running them.',
  ].join(' ')
  return {
    name: 'remote_exec',
    description,
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Server alias returned by remote_hosts. Only configured hosts are accepted.',
        },
        command: {
          type: 'string',
          description: 'Shell command to run on the remote server, for example `df -h` or `systemctl status nginx`.',
        },
        description: {
          type: 'string',
          description: 'Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI).',
        },
        workdir: {
          type: 'string',
          description: "Working directory for this call. Defaults to the host's configured workdir; a relative path resolves against it (or the remote user's home when the host has none).",
        },
        timeoutMs: {
          type: 'number',
          description: `Timeout in milliseconds. Defaults to ${options.defaultTimeoutMs} and is capped at ${options.maxTimeoutMs}. On expiry the local SSH client is killed; the remote command may keep running.`,
        },
      },
      required: ['host', 'command', 'description'],
    },
    output: { schema: {}, render: renderRemoteExec },
    async execute(args, exec) {
      const host = resolveHost(options, args.host)
      if (typeof args.command !== 'string' || args.command.trim().length === 0) throw new Error('command must be a non-empty string')
      if (typeof args.description !== 'string' || args.description.trim().length === 0) throw new Error('description must be a non-empty string (shown in the UI)')
      for (const pattern of host.denyPatterns) {
        if (pattern.test(args.command)) throw new Error(`command blocked by host "${host.name}" deny pattern /${pattern.source}/`)
      }
      await maybeApprove(ctx, options, host, args.command, exec)
      const timeoutMs = clampTimeout(args.timeoutMs, options)
      const workdir = normalizeWorkdir(args.workdir, host)
      const remoteCommand = buildRemoteCommand(host, workdir, args.command)
      const run = await runSsh(options, host, remoteCommand, timeoutMs, exec.signal)
      return {
        host: host.name,
        target: `${host.user}@${host.host}`,
        command: args.command,
        workdir: workdir ?? null,
        exitCode: run.exitCode,
        signal: run.signal,
        timedOut: run.timedOut,
        aborted: run.aborted,
        timeoutMs,
        durationMs: run.durationMs,
        stdout: run.stdout,
        stderr: run.stderr,
        ...(run.spillPath === undefined ? {} : { spillPath: run.spillPath }),
      }
    },
  }
}

/**
 * Register the remote shell tools.
 * @param ctx - plugin context with the tools service.
 * @param config - Loader row config (hosts, limits, approval mode).
 */
export function apply(ctx, config) {
  const options = normalizeOptions(config)
  ctx.tools.register(createHostsTool(options))
  ctx.tools.register(createExecTool(ctx, options))
  const configApi = {
    available() {
      try {
        return ctx.fiber?.entry !== undefined && ctx.get('configEditor') !== undefined
      } catch {
        return false
      }
    },
    async saveHosts(hosts) {
      const entry = ctx.fiber?.entry
      const editor = ctx.get('configEditor')
      if (entry === undefined || editor === undefined) throw new Error('this profile cannot persist plugin configuration')
      await editor.edit(entry, (current) => {
        const candidate = { ...current, hosts }
        // Validate the whole candidate config before the edit commits.
        normalizeOptions(candidate)
        return candidate
      })
    },
  }
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: RPC_PATH,
      handler: createRpcHandler(options, () => {
        try {
          const modules = ctx.get('clientModules')
          return typeof modules?.clientPath === 'function' ? (modules.clientPath('@local/dsh-remote-shell') ?? null) : null
        } catch {
          return null
        }
      }, configApi),
    }), 'dsh-remote-shell: http route')
  })
}
