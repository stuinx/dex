# 整体验收独立复核（2026-10-17）

## 范围与判定口径

复核目标为 `codex/overall-optimization` 工作区。保留开始时已存在的 dirty 文件，不回退业务成果、不改业务代码、不接触其他工作区；本次仅新增本报告。远端操作均为只读 SSH 查询、配置检查、DNS/TLS 请求，没有重启、安装、写配置、生成凭证或改权限。

- **已通过**：本次直接执行并得到预期结果。
- **失败**：本次观察到与目标不符的结果。
- **未验证**：缺少运行条件、界面交互或可安全验证的触发环境。
- **不适用**：该主机/模块不承载此功能。

本地隔离测试证明的是给定样例/模拟条件下的逻辑，不等同于全新安装、真实公网故障、真实业务数据面、用户浏览器交互或完整升级验收。

## 本地检查矩阵

| 检查 | 状态 | 本次证据与边界 |
|---|---|---|
| `tools/test-client-vless-only.cjs` | 已通过 | VLESS-only 节点清理、保存校验、旧 VMess 拒绝及内部隧道保留的隔离回归。 |
| `tools/test-debian-suites.cjs` | 已通过 | Debian 12/13 源与依赖处理、PHP key handling、sysctl/kernel 调优；APT、下载和包状态为模拟。不是实机安装。 |
| `tools/test-download-reliability.sh` | 已通过 | Bash 3.2 下 client/server 下载失败、校验不符、成功替换共 6 个隔离 mock 场景。不是公网故障注入或完整安装/更新。 |
| `tools/test-node-save-ui.cjs` | 已通过 | 真实 handler 的成功跳转、失败留页及错误提示行为。 |
| `tools/test-node-save.php` | 已通过 | 按脚本用法显式传入 `resource/client/ui-web/act/NodeSave.php all` 后 12 项通过，含未认证拒绝和字段校验。裸跑只显示用法并返回 2，不是测试失败。 |
| `tools/test-nodesm.cjs` | 已通过 | NodeSM 预设路由、拒绝 VMess、旧规则清理、重建/重置/状态识别的隔离回归；不等同真实流量分流。 |
| `tools/test-smartdns-doh-config.sh` | 已通过 | Client/UI 配置生成保留固定 IP、端口、PATH 并要求 hostname 校验；不是过期证书或线上 SmartDNS 的完整场景。 |
| `tools/test-socks5-outbound.cjs` | 已通过 | 独立 profile、域名路由、失效凭证拒绝和配置回滚等隔离测试，不是线上出口流量验收。 |
| `tools/test-socks5-udp.cjs` | 已通过 | UDP 地址生成和解析失败拒绝的隔离回归。 |
| `tools/test-vless-loopback.cjs` | 未验证 | 当前环境无可用 `XRAY_BIN`，测试明确要求配置 Xray 可执行文件；未安装新依赖。 |
| `tools/test-vless-migration.cjs` | 已通过 | VMess/VLESS 共存、迁移、回滚和普通 Client VLESS-only 隔离回归。 |
| `tools/test-live-inbounds.py` | 未验证 | 这是对真实公网入站做 HTTPS 与 UDP STUN 数据面流量的动态测试，需要私有 Server fixture 和 Xray binary；按本任务边界留给主代理执行。没有读取或输出 fixture 凭证。 |
| Archive ZIP CRC | 已通过 | `unzip -tq resource/client/Archive.zip` 无压缩数据错误。 |
| Archive SHA-256 | 已通过 | 实算及 `.sha256sum` 均为 `f268e0ca9102369ccf95eb4440e4ef0e09cde011cbfe57150e6ac31ab53513fe`。 |
| Archive/源码链 | 已通过 | `bash tools/check-self-owned-release-chain.sh` 报告 dex-owned sources/resources/checksums/archives valid；验证仓库定义的源码/资源一致性链。ZIP 有 1769 个条目。 |
| PHP 语法 | 已通过 | `resource/client/ui-web` 下全部 PHP 文件及 NodeSave lint 无语法错误。PHP 新版本对既有 `ddns.php`、`index.php` 字符串插值输出弃用警告；不影响语法通过。 |
| Bash 语法 | 已通过 | `bash -n client server resource/kernel/installkernel` 成功；Shell 下载测试亦已运行。 |
| whitespace/diff 检查 | 已通过 | `git diff --check` 无输出、返回成功。 |

测试汇总：已枚举所有现有 `tools/test-*`。静态/隔离测试均已尝试；NodeSave PHP runner 以其要求的 handler 参数补跑成功。VLESS loopback 缺少 `XRAY_BIN`，而 live-inbounds 是真实流量动态测试，按主代理独占动态测试的边界未运行。

## 远端只读检查矩阵

| 项目 | sam (`root@sam.stuinx.eu.org:11122`) | sgn (`root@sg.vin.dpdns.org:55522`) | vm1224 (`root@10.0.0.224:22`) |
|---|---|---|---|
| SSH 与主机只读查询 | 已通过 | 已通过 | 已通过；使用指定 known_hosts 文件 |
| Nginx / Xray 配置检查 | 已通过：`nginx -t`、Xray `run -test` 成功 | 已通过：`nginx -t`、Xray `run -test` 成功 | 已通过：`nginx -t`、Xray `run -test` 成功 |
| 主要服务 | 已通过：nginx、vtrui、doh-server、unbound、haproxy active；RproxyS active | 已通过：nginx、vtrui、doh-server、unbound、haproxy active；RproxyS active | 已通过：nginx、vtrui、smartdns、mosdns、nftables、php7.4-fpm active |
| failed unit 当前快照 | 已通过：0 | 已通过：0 | 已通过：0 |
| 关键监听 | 已通过：Nginx 80/443/2053/8443；vtrui 2087/33332/35353；HAProxy 20961/55443；DoH/Unbound loopback | 已通过：Nginx 55443/55445/55448；vtrui 44456/44457/55446/55447/55500；HAProxy 52096；DoH/Unbound loopback | 已通过：Nginx 80/443；vtrui、SmartDNS、MosDNS loopback 监听 |
| DNS 递归/权威链 | 已通过：sam 域名递归至 `146.235.237.190`；trace 显示 `eu.org` → Cloudflare 权威区 → A 记录 | 已通过：sg 域名递归至 `103.167.150.209`；trace 显示 `dpdns.org` → Cloudflare 权威区 → A 记录 | 已通过：通过本机 resolver 查询两域名均可解析；对 sgn 查询首次为空、随后重查成功，需注意此次存在短暂查询不稳定信号 |
| 证书文件有效期与 SAN | 已通过：`/var/www/ssl/de_GWD.cer` 有效至 2026-12-08；SAN 含 `*.sam.stuinx.eu.org`、`*.stuinx.eu.org`；sam 域名 TLS hostname 校验成功，HTTP 200 | 本机证书检查通过：有效至 2026-12-21；SAN 含 `*.sg.vin.dpdns.org`、`*.vin.dpdns.org`、`vin.dpdns.org`。sgn 对外入口为 `:55443`；本次初查从 sgn 主机访问 FQDN `:443` 收到共享 NAT 入口上其他主机名的证书、访问 FQDN `:55443` 失败。`:443` 未配置为 sgn 本机监听，且属于 NAT 共享入口，因此该结果不判定为 dex 证书故障，也不代表对外 `:55443` 状态；对外服务验收待主代理独立测试结果。 | 仅本机证书检查：`/var/www/ssl/de_GWD.cer` 的 subject 为 `localhost.com`，有效至 2036-10-10；当前未对其作为公共域名证书作有效性判断。 |
| HAProxy 语法 | 已通过：配置文件 valid | 已通过：配置文件 valid | 不适用 |
| 真正用户流量/数据面 | 未验证 | 未验证 | 本轮未发起新代理流量测试；交接中先前的 TCP/UDP 通过是历史证据，不是本轮复测 |

监听列表只显示端口和进程，不输出任何 UUID、密码、私钥或完整配置内容。当前服务状态是采样时状态，不证明重启持久性、完整安装或升级成功。

### 功能菜单与代码实现清点

静态检查了当前 `server` 菜单和实现入口：菜单列出 `22.RproxyS`、`34.WireGuard`、`35.SOCKS5 outbound`、`44.HAProxy TCP`、`55.Extra Xray`。对应函数/代码存在：RproxyS 配置/部署/停止/状态及端口映射；WireGuard 页面/管理入口；SOCKS5 outbound profile 与域名路由；HAProxy TCP 转发规则增删与配置校验；Extra Xray inbound 管理。Client 页面代码包含 NodeSM/NodeCU/NodeDT 的规则、保存/切换/检查入口。此项只证明源码中菜单和实现入口存在，不证明每种菜单操作在当前业务配置下可成功，也不证明 GUI 浏览器点击行为。

## 尚待主代理执行的真实功能验收

以下场景会改变服务配置或业务流量，本轮按职责交给主代理执行。每项应先确认可恢复备份、使用无冲突测试端口/测试节点、记录脱敏前后配置摘要，并在失败时恢复后验证；不得把 mock 结果当作现场通过。

1. **RproxyS**：在 sam 或 sgn 选空闲端口和测试 UUID；分别验证 server tunnel 保存/生成、添加 inbound UUID、添加 TCP/UDP/tcp+udp 映射、保存后服务状态/监听端口、从独立客户端实际连通；再删除测试映射并停止该功能，确认既有主入站、SOCKS5、转发规则仍在。客户端与服务端路由均需测，避免仅以 `active` 判断可用。
2. **HAProxy**：先备份并读取现有规则摘要，选无冲突监听端口及可控 upstream；经菜单新增规则，检查 HAProxy 语法、监听和端到端 TCP 响应；删除刚建的规则后确认仅该规则消失、既有规则/监听未变。sam、sgn 两边分别确认当前已有规则不会被覆盖。
3. **55 附加入站**：使用测试端口新增 WS VLESS 和 Reality VLESS（若产品菜单支持的参数组合），核对生成配置、端口监听及 Xray 配置检查；以真实客户端逐一验证 TCP/UDP/Reality 握手，再删除测试项并核对主入站、现存额外入站/VMess 兼容项不变。检查端口冲突与错误证书/Reality 参数拒绝行为。
4. **35 出口（Server 菜单）**：在 Server 侧使用测试 profile 创建 SOCKS5 出口，vm1224 作为配合的 Client 发起测试流量；验证域名规则命中该出口、未匹配域名走既定默认出口。另测空规则、多个 profile、禁用/删除单 profile、禁用全部、错误凭证拒绝及 Xray 校验失败回滚。测试前后核对 Server 既有入站和其他路由未变，使用可识别的受控 HTTP/IP 回显目标，不记录凭证。
5. **34 WireGuard**：用新的测试 peer/临时端口和备份验证生成密钥/配置、二维码/客户端配置、启停与删除；双端确认握手、路由和实际受控流量，再恢复配置。不得覆盖现有 peer 或输出私钥。
6. **NodeSM / NodeCU / NodeDT**：浏览器依次验证载入、添加/移除域名或 IP 规则、保存、状态检查、重建、禁用/重置及页面刷新后的持久化；再以每类至少一个匹配域名和一个非匹配目标测试真实分流出口。核对互不相关分流表和内部隧道保持原状。NodeSM 隔离测试 PASS 不代表这项数据面验收。
7. **浏览器节点保存与排序**：用已登录 vm1224 页面添加合法 VLESS 节点、编辑、保存、重排、刷新后确认顺序与字段均持久；再提交非法域名/端口/UUID/PATH/TLS 值确认保留输入并显示错误；最后未登录访问保存 handler 仍返回 401。比对脱敏配置摘要，不截图或复制凭证。此次真实浏览器交互未执行。
8. **DoH 证书错误、过期与恢复**：正确 leaf 与过期 leaf 的隔离 SmartDNS 测试已完成，见下方补充验收。错误主机名 leaf、生产 resolver 故障/恢复路径未在本次补充测试中注入；勿在生产 resolver 上制造中断。
9. **sgn 对外入口**：按配置的 `:55443` 对外入口验收。`:443` 未配置为 sgn 本机监听，属于共享 NAT 入口；该端口返回其他主机名证书不作为 dex 证书故障判据。动态网络结果应以对外 `:55443` 的实测为准，相关结果不在本报告中。本报告不将初查时 sgn 主机经 FQDN 访问 `:55443` 失败外推为外部访问失败。

## 本次未做事项

- 未跑完整安装、更新或重启验收；未改远端状态。
- 未安装 Xray 来满足 loopback/live-inbounds 测试条件。
- 未执行完整安装/更新/重启、实际 55/35/34 操作或 NodeSM/NodeCU/NodeDT 流量验证；过期证书只在临时本地 DoH stub 与独立 SmartDNS 进程中验证，未注入生产 resolver。
- 未修业务代码、Archive、交接/路线图；未提交、推送或发布。

## 复核结论

本地指定回归、源码/Archive 链、PHP/Bash 语法及三台主机只读服务/配置检查总体通过，但 VLESS 回环缺少 Xray binary；多个真实菜单数据面场景尚未验证。sam 的当前 HTTPS 检查通过。sgn 对外入口为 `:55443`；共享 NAT 的 `:443` 证书结果不作为 dex 证书故障判据。本报告保留本轮原始只读检查范围，不宣称所有功能通过。

## 补充验收：SmartDNS 对过期 DoH 证书的处理（2026-10-17）

| 项目 | 状态 | 证据与范围 |
|---|---|---|
| vm1224 预检 | 已通过 | SmartDNS `1.2026.08.05-0921 (Release48.4)`、OpenSSL `3.5.7`、Python `3.13.5` 已安装；未安装依赖。执行前 loopback TCP/UDP 的 15432 和 TCP 15433 均可用。 |
| 测试证书 | 已通过 | 在 `/root/dex-full-acceptance-20261017/` 下自动临时目录中生成仅测试 CA、SAN 精确匹配的有效 leaf 与过期 leaf。有效 leaf 从当前时间前 5 分钟生效、30 天后过期；过期 leaf 的有效期结束于当前时间前 30 天。`openssl ca -startdate/-enddate` 创建 leaf，`openssl verify` 独立确认有效 leaf 链通过、过期 leaf 因过期被拒。私钥未离开远端临时目录，也未输出。 |
| 隔离 DoH stub 与 SmartDNS | 已通过 | Python 标准库 HTTPS DoH stub 仅监听 `127.0.0.1:15433`，根据 SNI 送出对应测试 leaf，并对 A 查询返回 `203.0.113.42`。单独前台 SmartDNS 进程使用临时配置/缓存、`ca-file` 指向测试 CA；`-host-name`、`-http-host`、`-tls-host-verify` 均设置为各自测试域名。SmartDNS 官方配置说明列出这些上游参数及全局 `ca-file`。 |
| 有效证书场景 | 已通过 | SmartDNS 对 `valid.expiry-test.invalid` 返回 `203.0.113.42`；stub 观察到匹配 SNI 与 HTTP Host；该独立 SmartDNS 进程查询后仍存活。 |
| 过期证书场景 | 已通过 | 对 `expired.expiry-test.invalid` 没有 A 答案；独立 SmartDNS 进程查询后仍存活，其 debug 日志包含 expiry 证据；stub 观察到该测试 SNI，TLS 校验失败前 HTTP 请求不会发送。 |
| 清理/生产边界 | 已通过 | 两个测试 SmartDNS 子进程均已终止；HTTPS stub 已 shutdown/close；临时 CA、leaf keys、配置、日志目录自动删除；检查无 15432/15433 listener，临时测试子目录数为 0；生产 SmartDNS 仍为 active。脚本只调用独立测试配置，不读取或改写生产 SmartDNS 配置，不重启服务，不执行 chmod/chown。 |

本地脚本为 [tools/test-smartdns-expired.py](../tools/test-smartdns-expired.py)。本次在本机将脚本通过 SSH 标准输入送至 vm1224 执行，没有把脚本或密钥写入仓库：

```sh
ssh -i /Users/stuinx/.ssh/stuinxo -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile=/private/tmp/dex-vm1224-stage2-knownhosts -p 22 root@10.0.0.224 python3 - < tools/test-smartdns-expired.py
```

结果：所有 4 条 PASS（有效 leaf 返回测试 IP；过期 leaf 无 A 答案且进程存活、日志确认 expiry；stub 观察到 SNI/Host；本地端口和临时密钥清理完成）。脚本在本机通过 Python `compile()` 语法检查。隔离结果证明当前 vm1224 SmartDNS 对本测试 CA 签发的过期 DoH leaf 会拒绝解析；它不覆盖生产 DoH 上游故障恢复行为。
