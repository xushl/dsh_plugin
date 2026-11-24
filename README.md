# dsh-remote-shell

Run commands on configured remote servers over SSH — from the DSH main panel or from the model.

一个 DeepSeek Harness 插件：在 DSH 主界面左侧栏增加「远程 Shell」面板，可以管理远程服务器（新建 / 编辑 / 删除）、测试连接、执行命令并查看输出；同时给模型注册 `remote_hosts` / `remote_exec` 两个工具，让模型也能在同样配置的服务器上执行命令。

- **零运行时依赖**：Host 半只用 Node 内置模块 + 本机 OpenSSH（Windows OpenSSH / Linux / macOS 均可），Client 半是普通 React 模块
- **服务器白名单**：模型和界面都只能访问配置里的服务器别名，不能连任意主机
- **密钥免密**：`BatchMode=yes`，不会弹交互式密码框；不存储密码，配置里只有私钥路径
- **可视化面板**：服务器列表、连接测试、命令执行、输出面板（退出码 / 耗时 / stderr / 截断提示）
- **安全护栏**：同源 HTTP 桥 + 环回校验、可选 `denyPatterns` 命令黑名单、可选模型侧审批（`approval: always`）

## 安装

要求：DeepSeek Harness（0.2.x）、本机有 `ssh` 客户端。

1. 克隆仓库：

   ```bash
   git clone https://github.com/xushl/dsh_plugin.git dsh-remote-shell
   ```

2. 让 agent 安装这个本地 bundle（推荐）：

   > 把 `dsh-remote-shell` 目录作为 bundle 安装

   等价于使用 `plugin_manager` 的 `install_bundle`，target 为克隆下来的目录。

   也可以手动安装：把该目录以 `link:` 方式加入当前 profile 的依赖，并在 profile 的 `cordis.patch.yml` 里插入一行：

   ```yaml
   - insert:
       - id: dsh-remote-shell
         name: "@local/dsh-remote-shell"
   ```

3. **刷新 DSH 页面**，左侧栏出现「远程 Shell」入口。

> 首次安装后需要刷新页面才会加载 Client 半；之后改插件代码时，重载插件（或重启 Harness）并刷新页面即可。

## 快速开始

1. 左侧栏 → **远程 Shell** → **新建服务器**，填写：
   - 别名（模型和界面里使用，例如 `my-server`）
   - 主机地址、用户名、端口
   - 私钥路径（或留空使用 ssh 默认密钥）
2. 点「测试连接」确认密钥认证可用。
3. 在「执行命令」里输入命令执行；也可以直接在对话里让模型执行。

## 服务器配置

面板保存的服务器写入你当前 profile 的插件配置；也可以在插件配置里直接维护（`hosts` 列表）：

```yaml
- insert:
    - id: dsh-remote-shell
      name: "@local/dsh-remote-shell"
      config:
        defaultTimeoutMs: 60000      # 默认超时（毫秒）
        maxTimeoutMs: 600000         # 单次调用允许的最大超时
        maxOutputChars: 24000        # stdout/stderr 各自保留的字符上限（头+尾各一半）
        approval: never              # never | always（always 时模型工具走 DSH 审批）
        hosts:
          - name: my-server        # 别名
            host: 192.0.2.10
            user: root
            port: 22
            identityFile: 'C:\Users\you\.ssh\dsh_remote_ed25519'
            workdir: /root
            shell: /bin/bash
```

可选字段：

| 字段 | 说明 |
| --- | --- |
| `proxyJump` | 跳板机（`ssh -J`） |
| `connectTimeoutSec` | 连接超时秒数，默认 10 |
| `extraOptions` | 额外 `-o` 选项，例如 `["Ciphers=aes256-gcm@openssh.com"]` |
| `denyPatterns` | 命令黑名单正则，例如 `["^rm -rf /", "shutdown"]` |
| `strictHostKeyChecking` | 全局，`yes`（默认）/ `accept-new` / `no` |
| `sshExecutable` | SSH 客户端路径，默认 `ssh` |

## 一次性 SSH 免密配置

```bash
# 1. 生成专用密钥（无口令；也会生成 .pub）
ssh-keygen -t ed25519 -f "$HOME/.ssh/dsh_remote_ed25519" -N '' -C dsh-remote-shell

# 2. 把公钥装到服务器（只需输一次密码）
type "$env:USERPROFILE\.ssh\dsh_remote_ed25519.pub" | ssh root@<server> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 3. 验证免密
ssh -i "$env:USERPROFILE\.ssh\dsh_remote_ed25519" -o BatchMode=yes root@<server> "echo KEY_OK"
```

提示：

- 插件使用 `BatchMode=yes`，带口令的私钥无法交互解锁；需要口令时请把密钥加载进 ssh-agent。
- 新服务器第一次连接前，先手动 `ssh -o StrictHostKeyChecking=accept-new root@<server>` 接受一次主机指纹，否则默认 `strictHostKeyChecking: yes` 会拒绝连接。

## 模型工具

| 工具 | 说明 |
| --- | --- |
| `remote_hosts` | 列出已配置服务器（别名、目标、工作目录、是否配了密钥） |
| `remote_exec` | 在指定服务器执行命令：`host` / `command` / `description`，可选 `workdir` / `timeoutMs`；返回 stdout、stderr、退出码、耗时，超长输出保留头尾并给出完整输出文件路径 |

示例（模型侧行为）：

```text
[stderr]
ls: cannot access '/nope': No such file or directory
[exit code: 2]
```

## 安全说明

- 服务器清单是**白名单**：工具/界面只接受配置里的别名，不能连接任意地址
- 界面走同源 HTTP 桥 `POST /dsh-remote-shell/rpc`：只接受本机环回 Host、校验 `Origin`、强制 JSON、GET 返回 405、请求体限制 256KB
- 配置里不存密码，只存私钥路径；私钥文件应留在 `~/.ssh`（ssh 客户端要求受限 ACL）
- 可选：`denyPatterns` 拦截危险命令；`approval: always` 让模型每次执行前走 DSH 审批（审批策略为 `never` 时会自动拒绝）
- 请只添加你自己拥有或获授权操作的服务器

## 已知限制

- 每次执行新建一条 SSH 连接（约 0.3–1.5s 开销），不支持保持 `cd` 状态；持久会话是后续计划
- 超时只杀本机 `ssh` 客户端，远端命令可能仍在运行
- 非交互执行：`vim` / `top` / `less` 等全屏程序会挂到超时（输出会是终端控制字符），交互式操作请用 DSH 自带终端面板 `ssh root@<server>`
- 目前不支持文件上传/下载、端口转发（`ssh -L`），计划后续加入
- 保存配置会重载插件，正在执行的命令可能被中断

## 开发

```text
dsh-remote-shell/
├─ index.js          # Host 半：工具、SSH 执行器、HTTP 桥、配置读写
├─ client.js         # Client 半：侧栏入口 + 主面板页面（React，纯 JS）
├─ cordis.patch.yml  # bundle 默认配置（hosts 为空，安全可发布）
├─ locale/           # 插件标题/描述（中英）
├─ icon.svg
└─ package.json      # exports "."、"./client"、dsh.client 声明
```

修改后：重载插件（或重启 Harness），再刷新页面。语法自检：

```bash
node --check index.js
node --check client.js
```

## License

[MIT](LICENSE)
