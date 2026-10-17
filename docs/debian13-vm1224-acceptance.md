# vm1224 Debian 13 安装验收

## 授权与测试代码

- 用户确认：备份旧 dev，从当前 vless 重建 dev；先测试已安装 Client 的 Debian 12 直接升级，验证通过后恢复 init，再升级 Debian 13 并全新安装 dex。
- 新工作区：`/Users/stuinx/.codex/worktrees/dev-debian13/dex`，分支 dev，基于 vless 最新提交 `6ede570`，主协议 VLESS。包含 Debian 13 和此前 Meta AI 的未提交改动。
- 旧 dev 保留为 `codex/dev-before-debian13-20261013`，原工作区 `/Users/stuinx/.codex/worktrees/dev-nodesm/dex` 的未提交 NodeSM 工作仍完整保留。原 vless 工作区未覆盖。
- 不推送远端；测试资源通过 SSH 回送的本地 HTTP 服务提供，确保未发布的安装脚本和运行资源一致。
- 未添加或手动执行权限修改。

## 初始状态与恢复点

- vm1224：Debian 12 bookworm，内核 `6.1.0-53-amd64`，2 vCPU / 2 GiB RAM，根盘约 8 GiB，升级前可用约 4.1 GiB。
- vtrui、nginx、Docker、nftables active，失败单元 0；qemu-guest-agent active。
- PVE 升级前快照：`codex-before-debian13-20261013`。现有 init 快照保留。
- 当前代理核心：Xray 26.3.27。

## 第一阶段：已有 Client 直接升级

### 升级前发现的问题

- 原默认节点仍使用 VMess 连接 LAX `:2096`；LAX 主入站已经是 VLESS。同一节点的 UUID 和 WS PATH 经无回显校验一致，故协议不一致是既有连接问题。
- 初次 bookworm APT 更新在 Sury/Docker HTTPS 请求上失败，升级脚本停止，未进入系统版本切换。
- 已保留原 Client 配置副本，并将该节点的协议同步为 VLESS；UUID、PATH、其他节点未变。Xray 配置检查通过。
- 修复协议后，代理 HTTPS 200，Sury HTTPS 可访问。下一次 APT 更新发现原 Docker `.list` 指向的旧 keyring 无法验证当前签名；按项目已有方式改用 ASC keyring 和 USTC deb822 Docker 源后，签名验证和系统升级继续成功。未关闭 APT 签名检查。

### 直接升级与验收

- 升级执行单元：`dex-debian13-phase1.service`。
- 远端日志：`/root/dex-debian13-test/phase1-upgrade.log`。
- 软件源切换包括 Debian、已有 Sury 和 Docker 的发行代号，暂时禁用 backports；安装 Debian stock 内核元包和 libmimalloc3。
- 系统升级返回 0，Debian 13 trixie 已确认；首次重启运行 `6.12.111+deb13-amd64`。
- 现场发现 amd64 Nginx 依赖 `libmimalloc.so.2`，libmimalloc3 替换旧系统库后 Nginx 无法启动。已将 Debian 官方 ABI 2 库和版权/来源/SHA256 纳入 dex，并由 Client/Server 的 Nginx 安装过程按需部署到私有库目录；未修改 Nginx 核心，未混用 bookworm APT 源，未将 ABI 3 冒充 ABI 2。实机 Nginx 链接、配置测试及启动已恢复。
- procps 升级将已修改的 `/etc/sysctl.conf` 保存成 `.dpkg-bak`，导致升级前指向该文件的链接失效。直接升级的准备脚本改为在升级前保存配置到 sysctl.d；新 dex 更新过程会重新生成原路径与持久加载链接。
- 已在 Debian 13 执行新 dev Client 完整更新，返回 0；更新后再次重启，主要服务、配置检查、DNS、策略路由及本机 TCP/UDP 通过。PVE 经 vm1224 的局域网透明 TCP 返回 HTTP 200，UDP STUN 出口与 LAX 一致。
- 第一阶段通过快照：`codex-debian13-upgrade-ok-20261013`。日志已保存至本机 `/private/tmp/dex-debian13-logs.dcWpTb`。
- 项目既有开机内核清理会移除不匹配运行内核名称的包，包括 `linux-image-amd64` 元包；验收检查实际运行的内核包，未改动该原有清理行为。

## 第二阶段：init → Debian 13 → 全新安装

- 已恢复 init，确认 Debian 12 且无 `/opt/de_GWD`。新 SSH 指纹通过 PVE guest agent 核验，使用独立测试 known_hosts；基础系统升级返回 0，重启运行 Debian 13 / `6.12.111+deb13-amd64`。
- Client 首次运行部署到运行规则更新时，一个加速站点校验文件请求持续等待；短超时复验失败，但 DNS 解析与代理 HTTPS 正常。保留等待日志后停止该测试单元，使用测试专用 SSH 转送原始规则及校验文件重试；未修改项目默认下载地址，未绕过 SHA256。重试返回 0，日志包含 `de_GWD Installed`，GeoSite、GeoIP、ChnrouteIP 均通过。
- Nginx 私有 ABI 2 库 SHA256 与仓库一致；Nginx/PHP/Xray 配置检查通过。smartdns、mosdns、vtrui、nginx、php7.4-fpm、docker、nftables、cron、chrony active，Pi-hole healthy。
- 本机 DNS 53/5332/5331、HTTPS 200、TCP/UDP 的 LAX 出口一致；Web UI 302 为认证跳转。
- LAX 主 VLESS 和额外 VMess 节点切换分别通过 HTTPS 200 和 UDP/STUN。临时节点配置已恢复，默认为 LAX 主 VLESS。
- Meta AI 配置检查通过，访问日志确认请求命中 `nodeSMmetaai` VMess 出站；网站返回 403。此结果仅证明分流和连接，不能证明 LAX 出口可使用 Meta AI。临时访问日志配置已恢复。
- 安装后再次重启：失败单元 0，服务、配置、策略路由及本机 TCP/UDP 通过；PVE 经 vm1224 的 LAN HTTPS 200、UDP/STUN 的 LAX 出口通过，临时路由已自动清理。NTP 在启动短暂等待后 Leap status 为 Normal。
- 0conf 为 666，Xray 配置为 644；本轮未增加或手动执行 chmod/chown，保留项目既有权限行为。
- 第二阶段日志保存在 `/private/tmp/dex-debian13-logs.dcWpTb`；恢复快照 `codex-debian13-fresh-ok-20261013`。
- 重启验收后，使用项目默认下载地址再次执行 `ui_4am`（测试外层限定 40 秒，不使用转送变量），返回 0，规则更新通过。首次请求等待记录保留；不将全新安装首轮记作一次成功。

## 本地验证

- Debian 12/13、amd64/arm64 的隔离安装/更新源、依赖、Sury key 清理和 sysctl 持久化测试通过。
- NodeSM 回归和归档/校验链检查通过。
- 新 dev 的迁移测试已同步此前确定的 UUID 末六位 PATH 规范；迁移、回滚、幂等、VMess/VLESS 共存、新安装及节点协议保持回归通过。

## 验收边界与尚未完成

- 两阶段 Debian 13 amd64 Client 验收完成，默认在线规则更新的后续复验通过；全新安装首轮有网络等待、使用转送重试的历史，不能宣称首轮无干预成功。
- Server 的 Debian 13 实机安装、arm64 实机和可选 Zabbly 等内核安装未验证。
- 未提交或推送；远端旧 dev 未覆盖。原 vless 工作区未修改，旧 dev 未提交工作仍保留。
- 后续 sam 验收发现 vm1224 的 Exim4 于 12:39 延迟退出，原因是 IPv6 回环 `::1` 不可用、端口 25 绑定失败；此前即时检查 0 failed 的记录仍保留，但不能宣称后续所有系统单元持续无故障。dex 代理/DNS 服务正常，邮件服务未修改。
