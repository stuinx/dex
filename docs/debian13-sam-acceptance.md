# sam Debian 13 Server 验收

## 范围与恢复

- 用户确认在 sam 执行系统升级、部署新 dev Server 并以 vm1224 双端验收及重启复验；不推送远端。
- 测试代码：`/Users/stuinx/.codex/worktrees/dev-debian13/dex`，dev，基于 `6ede570`，未提交改动。
- 初始：Debian 12 bookworm，Zabbly `7.2.4-zabbly+`，KVM，根盘 46 GiB、可用 39 GiB，业务服务 active、失败单元 0，外部 HTTPS 200。
- 完整配置备份：sam `/root/dex-debian13-test/before-upgrade.tar`；本机副本在 `/private/tmp/dex-sam-debian13.bRyZDi/`，两个 SHA256 一致。备份包含私密配置，仅留在受保护目录，不写入仓库。
- 本次未创建或验证提供商整机快照；配置备份不能代替整机快照。升级经用户确认。
- 已备份项目、Nginx、证书、ACME、APT、sysctl、systemd 和启动配置。证书现有私钥模式为 644，未手动改权限。

## 升级与部署结果

- 系统升级返回 0，重启为 Debian 13 trixie / `7.2.10-zabbly+`。升级前以 SHA256 验证私有 Nginx ABI 2 库并部署，升级及更新后 Nginx 均正常。
- 日志：sam `/root/dex-debian13-test/upgrade.log`，退出标记 `upgrade.exit`。
- 旧额外入站字段与新 dev 不同，且保存文件中的 UUID/PATH、REALITY 密钥、SOCKS5 端口/账号等，与升级前实际运行配置不一致。保留两份原始配置，以升级前运行配置为准迁移到新格式；原 SOCKS5 运行端口 35353 保留，不采用保存文件里的 5553。
- 本次临时迁移脚本初次处理无 tag 的主入站时失败，已修正、重新生成候选并重新更新；最终所有额外入站端口、UUID、PATH、账号、REALITY 设置和转发目标，均与升级前运行配置核对一致。该临时映射仅服务本次测试，不代表仓库已经实现旧格式自动迁移。
- 新 dev Server 最终更新返回 0。主协议由 VMess 迁移为 VLESS，主 UUID/PATH 的升级前后哈希一致；未新建证书，证书 SAN/有效期保持不变，证书及私钥模式均为原有 644。
- Nginx、Xray、DoH、Unbound、Chrony、nftables、cron active；配置检查及 dpkg audit 通过。更新后再次重启，失败单元 0，NTP Normal。

## 双端测试

Client 为 vm1224 Debian 13。测试使用临时节点与独立测试核心，原 Client 配置已经备份；测试结束后恢复 LAX 默认节点，HTTPS 200。

| 项目 | 结果 |
| --- | --- |
| 主 VLESS WS TLS | HTTPS 200，透明 UDP/STUN 出口为 sam |
| 额外 VLESS WS TLS | HTTPS 200，透明 UDP/STUN 出口为 sam |
| REALITY | vm1224 独立测试核心经 sam 访问 HTTPS 200 |
| SOCKS5 TCP | 带账号验证的 SOCKS5 出口访问 HTTPS 200 |
| DoH | HTTP 200，application/dns-message，有效 DNS 应答 |
| 原有 33332 TCP 转发至本机 443 | HTTPS 200 |
| LAN TProxy | PVE 临时路由经 vm1224，HTTPS 200，UDP/STUN 出口为 sam；路由已清理 |
| 重启复验 | sam 服务/配置、主节点 TCP/UDP、DoH、LAN TProxy 通过 |

一次重启后 IP 查询站 TLS 请求短暂 EOF，后续原测试重试通过。一次 LAN 复验与 Client 配置恢复并行导致失败，已固定 Client 节点顺序重新测试通过；不将这两次失败算作首次通过。

## SOCKS5 UDP：首次验收诊断记录

- 原配置 UDP/STUN 两次超时；握手成功但返回 UDP 地址 `10.0.0.22:35353`，这是 sam 内网地址。
- 仅临时增加 SOCKS5 入站 `settings.ip` 为 sam 公网地址后，握手返回公网地址，UDP/STUN 立即通过，出口为 sam。由单变量复验确认该 NAT 场景问题，而非 Debian 13 或公网 UDP 映射故障。
- 首次验收结束时临时修改已恢复，未永久增加 `settings.ip`；随后用户授权修复，结果见下节。
- vm1224 的 Exim4 在本轮 sam 测试开始前（12:39）已因绑定 `::1` 失败；与本轮 Server 部署无关，代理和 DNS 服务正常，未擅自修改邮件服务。

## 日志与边界

- sam 日志在 `/root/dex-debian13-test/`，已复制到本机 `/private/tmp/dex-sam-debian13.bRyZDi/`，日志无回显完整 UUID、CF 凭证或密码赋值。
- Debian 13 Server amd64 的已有安装升级路径通过；未执行 sam 全新重装、ARM64 测试或全部可选功能验收。
- 旧格式仍需要手动迁移。未提交或推送。

## 后续 SOCKS5 修复与验收

- 用户授权修复并双端验证，要求 Client 不保留 VMess。Server `55` 的 VMess 功能未修改。
- `server` 的 SOCKS5 入站生成逻辑从已配置节点域名解析 IPv4 地址，填入 `settings.ip`，不再向公网客户端返回本机内网地址。解析失败返回错误，更新流程检查入站生成返回码；不增加权限操作，不改变端口、账号或密码。
- `tools/test-socks5-udp.cjs` 先复现生成配置缺少 IP 的断言失败，修复后通过；覆盖公网地址生成、其他配置保留、解析失败以及未启用 SOCKS5 时无需解析。
- sam 已通过实际脚本更新，返回 0；不是临时修改运行配置。UDP 握手返回 `146.235.237.190:35353`，vm1224 的 SOCKS5 HTTPS 200、UDP/STUN 出口为 sam。
- sam 再次重启，公网返回地址保留，业务服务 active、失败单元 0；双端 SOCKS5 HTTPS、UDP/STUN 再次通过。
- 测试使用公网/内网同号 35353，不包含异号 NAT 端口映射。
- vm1224 的节点及运行出站已核验无 VMess，独立测试核心已停止，正常代理 HTTPS 200。Client 源码仍有节点协议选项以及 FWD1/RproxyC 内部 VMess；已询问用户清理范围，未擅自改动隧道协议。
