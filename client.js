/**
 * dsh-remote-shell — browser half.
 *
 * Adds a "远程 Shell" entry to the main sidebar (`sidebar.panellist`) and its
 * page to the main panel (`main` keyed by the same id). The page lists the
 * configured servers, adds/edits/deletes them (saved back to the plugin config
 * through the Host half), tests connections, and runs commands through the
 * Host half's same-origin HTTP route (`/dsh-remote-shell/rpc`), which reuses
 * the same SSH runner as the `remote_exec` model tool.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-remote-shell',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const NS = '@local/dsh-remote-shell'
    const PANEL = 'remote-shell'

    const zh = {
      nav: '远程 Shell',
      title: '远程 Shell',
      subtitle: '在配置好的远程服务器上执行命令并查看输出。模型也能通过工具在同样的服务器上执行命令。',
      hostsTitle: '服务器',
      addHost: '新建服务器',
      editHost: '编辑',
      deleteHost: '删除',
      confirmDelete: '确认删除',
      cancel: '取消',
      save: '保存',
      saving: '保存中…',
      savedHint: '已保存，插件正在重载…',
      saveFailed: '保存失败：',
      noHosts: '还没有服务器，点「新建服务器」添加第一台。',
      keyOk: '密钥已配置',
      keyMissing: '未配置密钥（走 ssh 默认密钥）',
      workdir: '工作目录',
      shell: 'Shell',
      test: '测试连接',
      testing: '测试中…',
      testOk: '连接正常',
      testFail: '连接失败',
      runTitle: '执行命令',
      serverLabel: '服务器',
      commandLabel: '命令',
      commandPlaceholder: '例如：uptime && df -h /',
      timeoutLabel: '超时（秒）',
      run: '执行',
      running: '执行中…',
      outputTitle: '输出',
      exit: '退出码',
      timedOut: '已超时',
      duration: '耗时',
      truncated: '输出已截断，完整内容保存在 Host 临时文件',
      emptyOutput: '（无输出）',
      loadFailed: '无法连接插件 Host 接口：',
      runFailed: '执行失败：',
      retry: '重试',
      refresh: '刷新',
      hint: '这里直接执行命令，不经过模型；需要模型参与时在对话里说“上 xxx 看看”。',
      commandRequired: '请输入命令',
      serverRequired: '请选择服务器',
      nameLabel: '别名（模型和界面里用）',
      namePlaceholder: '例如 server-124',
      hostAddressLabel: '主机地址',
      hostAddressPlaceholder: '例如 192.0.2.10',
      userLabel: '用户名',
      portLabel: '端口',
      identityLabel: '私钥路径',
      identityPlaceholder: '例如 C:\\Users\\you\\.ssh\\dsh_remote_ed25519',
      identityHint: '留空则使用 ssh 默认密钥；公钥需在服务器 ~/.ssh/authorized_keys 里',
      workdirLabel: '默认工作目录',
      shellLabel: 'Shell',
      proxyLabel: '跳板机（-J，可选）',
      connectTimeoutLabel: '连接超时（秒）',
      extraOptionsLabel: '额外 ssh -o 选项（每行一个，可选）',
      denyPatternsLabel: '命令黑名单正则（每行一个，可选）',
      newHostTitle: '新建服务器',
      editHostTitle: '编辑服务器',
      formRequired: '请填写别名和主机地址',
      editableHint: '保存会写入当前 profile 的插件配置并自动重载插件；新配置对模型工具和本页同时生效。',
      readOnlyHint: '当前 profile 不支持在页面修改配置（configEditor 不可用），请直接编辑插件配置。',
      defaultsSummary: '默认超时 {timeout} 秒 · 输出上限 {chars} 字符',
    }

    const en = {
      nav: 'Remote shell',
      title: 'Remote shell',
      subtitle: 'Run commands on configured remote servers and read their output. The model uses the same servers through its own tools.',
      hostsTitle: 'Servers',
      addHost: 'New server',
      editHost: 'Edit',
      deleteHost: 'Delete',
      confirmDelete: 'Confirm delete',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      savedHint: 'Saved — the plugin is reloading…',
      saveFailed: 'Save failed: ',
      noHosts: 'No servers yet. Click "New server" to add the first one.',
      keyOk: 'key configured',
      keyMissing: 'no key (ssh defaults)',
      workdir: 'workdir',
      shell: 'shell',
      test: 'Test connection',
      testing: 'Testing…',
      testOk: 'Connected',
      testFail: 'Connection failed',
      runTitle: 'Run a command',
      serverLabel: 'Server',
      commandLabel: 'Command',
      commandPlaceholder: 'e.g. uptime && df -h /',
      timeoutLabel: 'Timeout (s)',
      run: 'Run',
      running: 'Running…',
      outputTitle: 'Output',
      exit: 'exit',
      timedOut: 'timed out',
      duration: 'duration',
      truncated: 'Output was truncated; the full output is saved to a Host temp file',
      emptyOutput: '(no output)',
      loadFailed: 'Cannot reach the plugin Host bridge: ',
      runFailed: 'Command failed: ',
      retry: 'Retry',
      refresh: 'Refresh',
      hint: 'Commands here run directly, without the model. To involve the model, ask it in the conversation.',
      commandRequired: 'Enter a command',
      serverRequired: 'Select a server',
      nameLabel: 'Alias (used by the model and this page)',
      namePlaceholder: 'e.g. server-124',
      hostAddressLabel: 'Host address',
      hostAddressPlaceholder: 'e.g. 192.0.2.10',
      userLabel: 'User',
      portLabel: 'Port',
      identityLabel: 'Private key path',
      identityPlaceholder: 'e.g. C:\\Users\\you\\.ssh\\dsh_remote_ed25519',
      identityHint: 'Empty uses the ssh default keys; the public half must be in ~/.ssh/authorized_keys',
      workdirLabel: 'Default workdir',
      shellLabel: 'Shell',
      proxyLabel: 'Jump host (-J, optional)',
      connectTimeoutLabel: 'Connect timeout (s)',
      extraOptionsLabel: 'Extra ssh -o options (one per line, optional)',
      denyPatternsLabel: 'Blocked command regexes (one per line, optional)',
      newHostTitle: 'New server',
      editHostTitle: 'Edit server',
      formRequired: 'Alias and host address are required',
      editableHint: 'Saving writes the current profile’s plugin config and reloads the plugin; both the model tools and this page pick it up.',
      readOnlyHint: 'This profile cannot persist plugin configuration here (configEditor unavailable). Edit the plugin config directly instead.',
      defaultsSummary: 'Default timeout {timeout}s · output cap {chars} chars',
    }

    const STYLE_ID = 'dsh-remote-shell-styles'
    const CSS = [
      '.dsh-rs-root{max-width:960px;padding:24px 28px 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.55;}',
      '.dsh-rs-title{margin:0 0 4px;font-size:18px;font-weight:600;}',
      '.dsh-rs-sub{margin:0 0 20px;color:var(--dsw-alias-label-secondary);font-size:13px;}',
      '.dsh-rs-section{margin-top:24px;}',
      '.dsh-rs-section-title{margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);}',
      '.dsh-rs-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}',
      '.dsh-rs-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}',
      '.dsh-rs-card-main{min-width:0;flex:1 1 320px;}',
      '.dsh-rs-hostname{font-weight:600;}',
      '.dsh-rs-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
      '.dsh-rs-meta{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:12.5px;}',
      '.dsh-rs-badge{display:inline-block;margin-left:8px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);vertical-align:2px;}',
      '.dsh-rs-badge-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}',
      '.dsh-rs-badge-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.dsh-rs-actions{display:flex;flex-direction:column;gap:6px;align-items:flex-end;}',
      '.dsh-rs-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}',
      '.dsh-rs-field{display:flex;flex-direction:column;gap:4px;min-width:150px;}',
      '.dsh-rs-field-wide{grid-column:1/-1;}',
      '.dsh-rs-label{font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.dsh-rs-input,.dsh-rs-select,.dsh-rs-textarea{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font-size:13px;font-family:inherit;outline:none;}',
      '.dsh-rs-input:focus,.dsh-rs-select:focus,.dsh-rs-textarea:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.dsh-rs-textarea{width:100%;min-height:56px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.5;}',
      '.dsh-rs-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 13px;font-size:13px;cursor:pointer;}',
      '.dsh-rs-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);}',
      '.dsh-rs-btn:disabled{opacity:.5;cursor:default;}',
      '.dsh-rs-btn-sm{padding:3px 9px;font-size:12px;border-radius:7px;}',
      '.dsh-rs-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.dsh-rs-btn-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);}',
      '.dsh-rs-form{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:16px;margin-bottom:12px;}',
      '.dsh-rs-form-title{font-weight:600;margin-bottom:12px;}',
      '.dsh-rs-form-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));}',
      '.dsh-rs-form-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:14px;}',
      '.dsh-rs-error{margin-top:10px;color:var(--dsw-alias-state-error-primary);font-size:13px;white-space:pre-wrap;word-break:break-word;}',
      '.dsh-rs-hint{margin-top:14px;color:var(--dsw-alias-label-secondary);font-size:12.5px;}',
      '.dsh-rs-note{margin-top:6px;color:var(--dsw-alias-label-secondary);font-size:11.5px;}',
      '.dsh-rs-out{margin-top:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;}',
      '.dsh-rs-out-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary);}',
      '.dsh-rs-out-pre{margin:0;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:380px;overflow:auto;}',
    ].join('\n')

    async function rpc(method, params) {
      const response = await fetch('/dsh-remote-shell/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: method, params: params }),
        cache: 'no-store',
      })
      let data = null
      try {
        data = await response.json()
      } catch (error) {}
      if (!response.ok) throw new Error((data && data.error) || ('HTTP ' + response.status))
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'remote-shell: malformed response')
      return data.value
    }

    function durationLabel(value) {
      if (typeof value !== 'number' || !isFinite(value)) return ''
      if (value < 1000) return value + 'ms'
      return (value / 1000).toFixed(2) + 's'
    }

    function hostTarget(host) {
      return (host.user || 'root') + '@' + host.host + ':' + (host.port || 22)
    }

    function emptyDraft() {
      return {
        name: '', host: '', user: 'root', port: '22', identityFile: '',
        workdir: '', shell: '/bin/bash', proxyJump: '', connectTimeoutSec: '',
        extraOptions: '', denyPatterns: '',
      }
    }

    function draftFromHost(host) {
      return {
        name: host.name || '',
        host: host.host || '',
        user: host.user || 'root',
        port: String(host.port || 22),
        identityFile: host.identityFile || '',
        workdir: host.workdir || '',
        shell: host.shell || '/bin/bash',
        proxyJump: host.proxyJump || '',
        connectTimeoutSec: host.connectTimeoutSec === undefined ? '' : String(host.connectTimeoutSec),
        extraOptions: (host.extraOptions || []).join('\n'),
        denyPatterns: (host.denyPatterns || []).join('\n'),
      }
    }

    function splitLines(text) {
      return String(text || '').split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
    }

    function draftToHost(draft) {
      const host = { name: draft.name.trim(), host: draft.host.trim() }
      if (draft.user.trim()) host.user = draft.user.trim()
      const port = Number(draft.port)
      if (isFinite(port) && port > 0) host.port = Math.floor(port)
      if (draft.identityFile.trim()) host.identityFile = draft.identityFile.trim()
      if (draft.workdir.trim()) host.workdir = draft.workdir.trim()
      if (draft.shell.trim()) host.shell = draft.shell.trim()
      if (draft.proxyJump.trim()) host.proxyJump = draft.proxyJump.trim()
      const connect = Number(draft.connectTimeoutSec)
      if (isFinite(connect) && connect > 0) host.connectTimeoutSec = Math.floor(connect)
      const extraOptions = splitLines(draft.extraOptions)
      if (extraOptions.length > 0) host.extraOptions = extraOptions
      const denyPatterns = splitLines(draft.denyPatterns)
      if (denyPatterns.length > 0) host.denyPatterns = denyPatterns
      return host
    }

    function SidebarIcon({ size }) {
      const s = typeof size === 'number' ? size : 20
      return h('svg', {
        viewBox: '0 0 64 64',
        width: s,
        height: s,
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('rect', { x: 6, y: 12, width: 52, height: 40, rx: 7, stroke: 'currentColor', strokeWidth: 4 }),
      h('path', { d: 'M19 28l6 5-6 5', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M31 40h14', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round' }))
    }

    function Badge({ text, tone }) {
      const cls = 'dsh-rs-badge' + (tone ? ' dsh-rs-badge-' + tone : '')
      return h('span', { className: cls }, text)
    }

    function Field({ label, wide, children }) {
      return h('label', { className: 'dsh-rs-field' + (wide ? ' dsh-rs-field-wide' : '') },
        h('span', { className: 'dsh-rs-label' }, label),
        children)
    }

    function OutputBlock({ t, result }) {
      if (!result) return null
      const stdout = result.stdout && typeof result.stdout.text === 'string' ? result.stdout.text : ''
      const stderr = result.stderr && typeof result.stderr.text === 'string' ? result.stderr.text : ''
      let body = stdout
      if (stderr.length > 0) {
        if (body.length > 0 && !/\n$/.test(body)) body += '\n'
        body += '[stderr]\n' + stderr
      }
      if (body.length === 0) body = t('emptyOutput')
      const status = []
      if (result.timedOut) status.push(t('timedOut'))
      else if (typeof result.exitCode === 'number') status.push(t('exit') + ' ' + result.exitCode)
      if (typeof result.durationMs === 'number') status.push(t('duration') + ' ' + durationLabel(result.durationMs))
      const truncated = (result.stdout && result.stdout.truncated) || (result.stderr && result.stderr.truncated)
      return h('div', { className: 'dsh-rs-out' },
        h('div', { className: 'dsh-rs-out-head' },
          h('span', null, t('outputTitle') + (status.length > 0 ? ' · ' + status.join(' · ') : '')),
          truncated ? h('span', null, t('truncated')) : null),
        h('pre', { className: 'dsh-rs-out-pre' }, body))
    }

    function RemoteShellPage({ t }) {
      const [config, setConfig] = React.useState(null)
      const [loadError, setLoadError] = React.useState('')
      const [selected, setSelected] = React.useState('')
      const [command, setCommand] = React.useState('uptime && df -h /')
      const [timeoutSec, setTimeoutSec] = React.useState('60')
      const [running, setRunning] = React.useState(false)
      const [runError, setRunError] = React.useState('')
      const [result, setResult] = React.useState(null)
      const [testState, setTestState] = React.useState({})
      const [editing, setEditing] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [saveError, setSaveError] = React.useState('')
      const [pendingDelete, setPendingDelete] = React.useState(null)

      const loadConfig = React.useCallback(async () => {
        setLoadError('')
        try {
          const value = await rpc('config', {})
          setConfig(value)
          const names = (value.hosts || []).map((host) => host.name)
          setSelected((current) => (current && names.indexOf(current) >= 0 ? current : (names[0] || '')))
          rpc('diag', { kind: 'panel-mounted', hosts: names.length }).catch(() => {})
        } catch (error) {
          setConfig({ editable: false, hosts: [], defaults: {} })
          setLoadError(String((error && error.message) || error))
        }
      }, [])

      React.useEffect(() => {
        loadConfig()
      }, [loadConfig])

      const hosts = (config && config.hosts) || []
      const editable = Boolean(config && config.editable)

      const reloadAfterSave = async () => {
        await new Promise((resolve) => setTimeout(resolve, 900))
        await loadConfig()
      }

      async function persistHosts(nextHosts) {
        setSaving(true)
        setSaveError('')
        try {
          await rpc('saveHosts', { hosts: nextHosts })
          setEditing(null)
          setPendingDelete(null)
          await reloadAfterSave()
          return true
        } catch (error) {
          setSaveError(String((error && error.message) || error))
          return false
        } finally {
          setSaving(false)
        }
      }

      function startAdd() {
        setSaveError('')
        setPendingDelete(null)
        setEditing({ index: null, draft: emptyDraft() })
      }

      function startEdit(host, index) {
        setSaveError('')
        setPendingDelete(null)
        setEditing({ index: index, draft: draftFromHost(host) })
      }

      function updateDraft(patch) {
        setEditing((current) => current === null ? current : { index: current.index, draft: Object.assign({}, current.draft, patch) })
      }

      async function saveEditing() {
        if (editing === null) return
        if (editing.draft.name.trim().length === 0 || editing.draft.host.trim().length === 0) {
          setSaveError(t('formRequired'))
          return
        }
        const draftHost = draftToHost(editing.draft)
        const next = hosts.map((host) => host)
        if (editing.index === null) next.push(draftHost)
        else next[editing.index] = draftHost
        await persistHosts(next)
      }

      async function deleteHost(index) {
        await persistHosts(hosts.filter((host, at) => at !== index))
      }

      async function testHost(name) {
        setTestState((current) => Object.assign({}, current, { [name]: { state: 'busy' } }))
        try {
          const value = await rpc('run', { host: name, command: 'echo REMOTE_SHELL_OK && hostname', timeoutMs: 15000 })
          const ok = !value.timedOut && value.exitCode === 0
          setTestState((current) => Object.assign({}, current, { [name]: { state: ok ? 'ok' : 'fail' } }))
        } catch (error) {
          setTestState((current) => Object.assign({}, current, { [name]: { state: 'fail' } }))
        }
      }

      async function runCommand() {
        if (!selected) {
          setRunError(t('serverRequired'))
          return
        }
        if (command.trim().length === 0) {
          setRunError(t('commandRequired'))
          return
        }
        const seconds = Number(timeoutSec)
        const timeoutMs = isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 60000
        setRunning(true)
        setRunError('')
        try {
          const value = await rpc('run', { host: selected, command: command, timeoutMs: timeoutMs })
          setResult(value)
        } catch (error) {
          setRunError(String((error && error.message) || error))
        } finally {
          setRunning(false)
        }
      }

      function renderEditor() {
        if (editing === null) return null
        const draft = editing.draft
        const isNew = editing.index === null
        return h('div', { className: 'dsh-rs-form' },
          h('div', { className: 'dsh-rs-form-title' }, isNew ? t('newHostTitle') : t('editHostTitle')),
          h('div', { className: 'dsh-rs-form-grid' },
            h(Field, { label: t('nameLabel') },
              h('input', {
                className: 'dsh-rs-input',
                value: draft.name,
                placeholder: t('namePlaceholder'),
                onChange: (event) => updateDraft({ name: event.target.value }),
              })),
            h(Field, { label: t('hostAddressLabel') },
              h('input', {
                className: 'dsh-rs-input',
                value: draft.host,
                placeholder: t('hostAddressPlaceholder'),
                onChange: (event) => updateDraft({ host: event.target.value }),
              })),
            h(Field, { label: t('userLabel') },
              h('input', {
                className: 'dsh-rs-input',
                value: draft.user,
                onChange: (event) => updateDraft({ user: event.target.value }),
              })),
            h(Field, { label: t('portLabel') },
              h('input', {
                className: 'dsh-rs-input',
                type: 'number',
                min: 1,
                max: 65535,
                value: draft.port,
                onChange: (event) => updateDraft({ port: event.target.value }),
              })),
            h(Field, { label: t('identityLabel'), wide: true },
              h('input', {
                className: 'dsh-rs-input dsh-rs-mono',
                value: draft.identityFile,
                placeholder: t('identityPlaceholder'),
                onChange: (event) => updateDraft({ identityFile: event.target.value }),
              }),
              h('span', { className: 'dsh-rs-note' }, t('identityHint'))),
            h(Field, { label: t('workdirLabel') },
              h('input', {
                className: 'dsh-rs-input dsh-rs-mono',
                value: draft.workdir,
                placeholder: '/root',
                onChange: (event) => updateDraft({ workdir: event.target.value }),
              })),
            h(Field, { label: t('shellLabel') },
              h('input', {
                className: 'dsh-rs-input dsh-rs-mono',
                value: draft.shell,
                placeholder: '/bin/bash',
                onChange: (event) => updateDraft({ shell: event.target.value }),
              })),
            h(Field, { label: t('connectTimeoutLabel') },
              h('input', {
                className: 'dsh-rs-input',
                type: 'number',
                min: 1,
                max: 120,
                value: draft.connectTimeoutSec,
                placeholder: '10',
                onChange: (event) => updateDraft({ connectTimeoutSec: event.target.value }),
              })),
            h(Field, { label: t('proxyLabel'), wide: true },
              h('input', {
                className: 'dsh-rs-input dsh-rs-mono',
                value: draft.proxyJump,
                onChange: (event) => updateDraft({ proxyJump: event.target.value }),
              })),
            h(Field, { label: t('extraOptionsLabel'), wide: true },
              h('textarea', {
                className: 'dsh-rs-textarea',
                value: draft.extraOptions,
                onChange: (event) => updateDraft({ extraOptions: event.target.value }),
              })),
            h(Field, { label: t('denyPatternsLabel'), wide: true },
              h('textarea', {
                className: 'dsh-rs-textarea',
                value: draft.denyPatterns,
                onChange: (event) => updateDraft({ denyPatterns: event.target.value }),
              }))),
          editable ? h('div', { className: 'dsh-rs-hint' }, t('editableHint')) : null,
          saveError ? h('div', { className: 'dsh-rs-error' }, t('saveFailed') + saveError) : null,
          h('div', { className: 'dsh-rs-form-actions' },
            h('button', {
              className: 'dsh-rs-btn dsh-rs-btn-primary',
              type: 'button',
              disabled: saving,
              onClick: saveEditing,
            }, saving ? t('saving') : t('save')),
            h('button', {
              className: 'dsh-rs-btn',
              type: 'button',
              disabled: saving,
              onClick: () => { setEditing(null); setSaveError('') },
            }, t('cancel'))))
      }

      const hostCards = hosts.map((host, index) => {
        const state = testState[host.name] || {}
        const test = state.state
        const testLabel = test === 'busy' ? t('testing') : test === 'ok' ? t('testOk') : test === 'fail' ? t('testFail') : ''
        const testColor = test === 'fail' ? 'var(--dsw-alias-state-error-primary)' : test === 'ok' ? 'var(--dsw-alias-state-success-primary)' : undefined
        return h('div', { className: 'dsh-rs-card', key: host.name },
          h('div', { className: 'dsh-rs-card-main' },
            h('div', null,
              h('span', { className: 'dsh-rs-hostname' }, host.name),
              h(Badge, { text: host.identityFile ? t('keyOk') : t('keyMissing'), tone: host.identityFile ? 'ok' : undefined })),
            h('div', { className: 'dsh-rs-mono dsh-rs-meta' }, hostTarget(host)),
            h('div', { className: 'dsh-rs-meta' },
              t('workdir') + ': ' + (host.workdir || '~') + ' · ' + t('shell') + ': ' + (host.shell || '/bin/bash')),
            testLabel ? h('div', { className: 'dsh-rs-meta', style: { color: testColor } }, testLabel) : null),
          h('div', { className: 'dsh-rs-actions' },
            h('button', { className: 'dsh-rs-btn dsh-rs-btn-sm', type: 'button', disabled: test === 'busy', onClick: () => testHost(host.name) }, t('test')),
            editable ? h('button', { className: 'dsh-rs-btn dsh-rs-btn-sm', type: 'button', onClick: () => startEdit(host, index) }, t('editHost')) : null,
            editable ? (pendingDelete === index
              ? h('div', { className: 'dsh-rs-row' },
                h('button', { className: 'dsh-rs-btn dsh-rs-btn-sm dsh-rs-btn-danger', type: 'button', disabled: saving, onClick: () => deleteHost(index) }, t('confirmDelete')),
                h('button', { className: 'dsh-rs-btn dsh-rs-btn-sm', type: 'button', onClick: () => setPendingDelete(null) }, t('cancel')))
              : h('button', { className: 'dsh-rs-btn dsh-rs-btn-sm', type: 'button', onClick: () => setPendingDelete(index) }, t('deleteHost'))) : null))
      })

      const defaults = (config && config.defaults) || {}
      const summary = typeof defaults.defaultTimeoutMs === 'number'
        ? t('defaultsSummary').replace('{timeout}', String(Math.round(defaults.defaultTimeoutMs / 1000))).replace('{chars}', String(defaults.maxOutputChars))
        : ''

      return h('div', { className: 'dsh-rs-root' },
        h('h1', { className: 'dsh-rs-title' }, t('title')),
        h('p', { className: 'dsh-rs-sub' }, t('subtitle')),

        h('section', { className: 'dsh-rs-section' },
          h('div', { className: 'dsh-rs-head' },
            h('h2', { className: 'dsh-rs-section-title', style: { margin: 0 } }, t('hostsTitle')),
            h('div', { className: 'dsh-rs-row' },
              h('button', { className: 'dsh-rs-btn', type: 'button', onClick: loadConfig }, t('refresh')),
              editable ? h('button', { className: 'dsh-rs-btn dsh-rs-btn-primary', type: 'button', disabled: saving || editing !== null, onClick: startAdd }, t('addHost')) : null)),
          summary ? h('div', { className: 'dsh-rs-meta', style: { marginBottom: '10px' } }, summary) : null,
          loadError ? h('div', { className: 'dsh-rs-error' }, t('loadFailed') + loadError) : null,
          editable ? null : h('div', { className: 'dsh-rs-note' }, t('readOnlyHint')),
          renderEditor(),
          hosts.length === 0 && editing === null && !loadError
            ? h('div', { className: 'dsh-rs-meta' }, t('noHosts'))
            : h('div', null, hostCards)),

        h('section', { className: 'dsh-rs-section' },
          h('h2', { className: 'dsh-rs-section-title' }, t('runTitle')),
          h('div', { className: 'dsh-rs-row', style: { alignItems: 'flex-end' } },
            h(Field, { label: t('serverLabel') },
              h('select', {
                className: 'dsh-rs-select',
                value: selected,
                onChange: (event) => setSelected(event.target.value),
              }, hosts.map((host) => h('option', { key: host.name, value: host.name }, host.name)))),
            h(Field, { label: t('timeoutLabel') },
              h('input', {
                className: 'dsh-rs-input',
                type: 'number',
                min: 1,
                max: 600,
                value: timeoutSec,
                onChange: (event) => setTimeoutSec(event.target.value),
              })),
            h('button', {
              className: 'dsh-rs-btn dsh-rs-btn-primary',
              type: 'button',
              disabled: running,
              onClick: runCommand,
            }, running ? t('running') : t('run'))),
          h(Field, { label: t('commandLabel'), wide: true },
            h('textarea', {
              className: 'dsh-rs-textarea',
              value: command,
              placeholder: t('commandPlaceholder'),
              onChange: (event) => setCommand(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !running) runCommand()
              },
            })),
          runError ? h('div', { className: 'dsh-rs-error' }, t('runFailed') + runError) : null,
          h(OutputBlock, { t: t, result: result })),

        h('div', { className: 'dsh-rs-hint' }, t('hint')))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), NS + ': dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.effect(() => {
        if (document.getElementById(STYLE_ID)) return () => {}
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = CSS
        document.head.appendChild(style)
        return () => {
          const node = document.getElementById(STYLE_ID)
          if (node) node.remove()
        }
      }, NS + ': styles')
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL,
        locale: NS,
      }, () => h(RemoteShellPage, { t: t })))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL,
        order: 40,
        label: () => t('nav'),
        locale: NS,
      }, (props) => h(SidebarIcon, { size: props && typeof props.size === 'number' ? props.size : undefined })))
    }

    exports.name = NS
    exports.inject = ['slots', 'locale']
    exports.apply = apply
    return module.exports
  },
})
