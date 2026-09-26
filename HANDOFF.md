# 当前交接：VLESS 主协议分支（2026-09-26）

- 当前仓库 `/Users/stuinx/Documents/ChatGPT/dex`，已由 dev 创建并切换到 `vless`。未提交、未推送。
- 本轮授权：实施 VLESS 主节点迁移，原 VMess 移至 55 保持兼容。实现及恢复边界见 `docs/vless-migration.md`。
- 开始时已有未提交修改：`server` 的 WireGuard/证书修复，以及 `ui-installCER`、`ui-updateSave`、`ui_4am`、Archive 及其校验值。已保留，提交时注意区分；不能把这些当成本轮新写的修复。
- 本轮改动：Server 主节点/兼容管理，Client 协议读写，既有 Client 节点页面协议选择、共享出站及分流身份处理，vless 资源默认来源，README、迁移文档、测试脚本。没有新增 Server PHP 页面。
- 已验证：脚本语法、Client PHP 语法；迁移/回滚/幂等/旧 UUID 保留/兼容启停/同地址节点区分的临时目录回归；真实 Xray 26.3.27 配置校验和 VMess、VLESS WebSocket TCP+UDP 本地回环。
- 最后核验通过：Archive 已重打包，1756 个资源文件与源码逐字节一致；SHA256 为 `b106c778b558c5c62b62990040a3b049c1f9144e93b041d94657490a9326a6b6`；release-chain 检查及 `git diff --check` 通过，Git 未报告文件模式变化。
- 测试脚本：`node tools/test-vless-migration.cjs`；`XRAY_BIN=/path/to/xray node tools/test-vless-loopback.cjs`。临时服务测试有模拟边界，回环测试不包含 Nginx/TLS 或 Linux TProxy。
- 未完成：Debian 双端现场验收、重启/完整更新数据面验收；未部署线上主机。远程安装命令须在分支推送后才能使用。
- 提交前核验：Archive 源码一致性、校验值、`bash tools/check-self-owned-release-chain.sh`、`git diff --check`、当前分支及变更范围。
- 坑：同域名同端口的 VMess/VLESS 不能仅按地址识别；保留 path/protocol/UUID。旧自定义非标准入站或 Nginx 布局停止自动迁移，不能强行覆盖。测试不要 source 整个安装脚本，脚本顶层会执行系统操作。

---

# 历史交接：de_GWD dev 安装与透明 TProxy 修复（2026-09-19，状态需重新核验）

## 范围与约束

- 仓库：`/Users/stuinx/Documents/dex`，分支：`dev`。
- 目标：修复全新 Debian client 安装、APT/Docker 依赖、nftables 重启持久化，并完成 stock/Zabbly A/B 与透明 TCP/UDP 验收。
- 遵循最小修改原则；本轮没有手动执行 `chmod` 或 `chown`，没有输出或写入任何凭证。
- 测试通过后再提交和推送。

## 本轮修改

- `client`
  - APT 默认参数增加 HTTP/HTTPS `Pipeline-Depth=0`，避免 USTC Docker CE/PHP 依赖下载卡在连接复用状态。
  - Docker CE 使用 USTC keyring 与 deb822 `docker.sources`，并对依赖包做安装后存在性检查。
  - flowtable 使用当前 `ip -o link` 网卡名，不再从启动早期的旧 sysfs 设备名生成 stale `ens18`。
  - nftables 改为等待 `network-online.target` 和 Docker、启用在 `multi-user.target`，拆分启动命令，使用幂等策略路由操作。
  - 安装后严格验证 nftables active、`fwmark 0x9 -> table 220` 和本地默认路由，不再删除 flowtable 文件来掩盖失败。
  - 在切换到脚本管理的 Debian 源前删除初始镜像的 `debian.sources`，消除重复源 warning。
- `server`
  - 同步 flowtable 动态网卡枚举和 nftables 网络启动顺序修复。
  - 在切换 Debian 源前删除初始镜像的 `debian.sources`。
- `resource/client/ui-script/ui-installDocker`
  - 可选 Docker UI 安装路径同步到 USTC keyring、deb822 `docker.sources`、APT 超时/重试/管线参数，并清理两种 Docker 源文件。
- `resource/client/Archive.zip`、`resource/client/Archive.zip.sha256sum`
  - 重新打包并通过 ZIP 测试，SHA-256 已同步。

## 实机验证

### 安装基线

- vm1225：从 `init` 快照恢复，stock Debian kernel；最终运行 `6.1.0-53-amd64`。
- vm1226：从 `init` 快照恢复，先安装 Zabbly；最终运行 `7.2.6-zabbly+`。
- 两台均使用同一份当前修改后的 `client`（临时复制，未提前推送），资源来源固定到已验证的上一版本 commit。
- 两台 installer 均返回 `0`，日志出现 `de_GWD Installed` 和 `Deploy nftables` 成功。
- APT/dpkg 安装完成后进程数为 0；Docker CE、PHP、Pi-hole、geodata 和 chnroute 资源均完成。

### 重启持久化

- 两台重启后 `systemctl --failed` 均为 0。
- `smartdns`、`mosdns`、`vtrui`、`nftables`、`nginx`、`php7.4-fpm`、`docker`、`cron`、`chrony` 均 active。
- 两台均保留：
  - `100: from all fwmark 0x9 lookup 220`
  - `local default dev lo scope host` in table 220
  - `define flowtable_eth = { docker0,eth0,ifb4eth0 };`
- nftables journal 未出现失败/错误/旧网卡不存在信息。
- cron active，`ui_4am`、`ui_4h`、`ui_2h` 和 `@reboot /etc/rc_kernel.local` 均存在。
- AutoUpdate UI 状态仍显示 `-`，这是未主动启用 AutoUpdate 的默认状态，不是 cron 前置依赖失败。

### 数据面

- 两台本机透明 TCP：`curl --noproxy '*' https://example.com` 返回 HTTP 200。
- 两台本机 TCP 出口均为 server 公网出口；同时观察到 client 到 server `:2096` 的 ESTABLISHED 连接。
- 两台本机透明 UDP：Cloudflare、MiWiFi、SIPGate STUN 均返回 Binding Success `0x0101`；单独的 QQ STUN 端点超时，不能作为系统性失败依据。
- PVE 临时 `/32` 路由经 vm1225 和 vm1226：
  - LAN PREROUTING TCP 返回 HTTP 200；
  - LAN PREROUTING UDP 返回 STUN `0x0101`；
  - 临时路由已删除，PVE 恢复为原默认路由。

### APT 源去重

- 两台执行与最终脚本相同的特定 `debian.sources` 清理后，APT update 返回码均为 0，duplicate warning 均为 none。
- A/B 全新安装主体在最终源去重小改动之前完成；源去重本身已在两台已安装 VM 上单独验证。

### 本地静态验证

- `bash -n client`
- `bash -n server`
- `bash -n resource/client/ui-script/ui-installDocker`
- `git diff --check`
- `unzip -tq resource/client/Archive.zip`
- Archive SHA-256：`f218fd5d628b557870b47abd6c4b6f3343667fc3b95d918bf60a80e1eb668f71`

## 提交前检查

- 重新查看 `git diff --check`、脚本语法、Archive SHA 和 `git status`。
- 提交后核对 `git log` 和远端 `dev` 指向；推送只针对当前 `dev` 分支。

## 恢复提示

- vm1225/vm1226 的 `init` 快照仍可用于重复 A/B 测试。
- PVE 当前临时测试路由已清理。
- 不要输出完整 vtrui 配置、UUID、Cloudflare 凭证或私钥。
