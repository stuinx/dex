# sam 上的 dev Server 测试（2026-11-06）

## 结论

当前已安装服务及本轮隔离数据面检查通过，但发现旧 RproxyS 设置格式兼容问题，不能据此宣布完整安装或生产升级验收通过。本轮未替换生产安装脚本、配置或核心，未重启服务/主机，未推送。

## 测试版本与环境

- 测试输入为 dev `4042408` 的源码快照，已逐项核对上传文件 SHA256。
- server SHA256：`6072431b8b694af85bea25f8a8311c4d8e89201a1f038e2746924df0ef6c0da0`。
- client SHA256：`a1742e0b3dedfea0a4c144fa9034bcbf9a102de2719185debe951f7c5ef1d868`。
- sam：Debian 13.7、amd64。Nginx、vtrui、DoH、Unbound、nftables、RproxyS、HAProxy 七项服务 active，失败单元为零。
- SSH 使用既有 sam 连接信息与本机密钥；本文不包含密钥、公钥、UUID、SOCKS5 密码或完整运行配置。
- 测试期间本地工作区发生其他并发业务代码修改；它们未上传，也不属于本报告的验证范围。本轮没有覆盖、提交或回滚这些修改。

## 已通过

| 检查 | 结果 | 边界 |
|---|---|---|
| 现有 Nginx/Xray/HAProxy 配置 | 原生配置校验通过 | 当前已安装版本 |
| 现有主 VLESS WS TLS | HTTPS 200、UDP STUN 通过 | sam 本机通过其域名入口发起；非独立外部 Client |
| 现有额外 VLESS WS TLS | HTTPS 200、UDP STUN 通过 | 同上 |
| 现有 REALITY | HTTPS 200、UDP STUN 通过 | 同上 |
| 现有 SOCKS5 | HTTPS 200、UDP STUN 通过 | 同上 |
| 外部 DoH | 从本机访问 sam 的 `/dq`，TLS 证书验证通过，HTTP 200，DNS ID/rcode/answer 正确 | 实际外部 TLS 与 DNS 请求；不代表全套 DNS 防泄露验收 |
| dev 下载保护 | sam Bash 5.2 下，Client/Server 成功、传输失败、校验失败六例通过 | 服务操作和下载响应为隔离模拟，不是完整安装 |
| dev DoH 生成 | 固定 IP/端口/路径与证书主机名参数回归通过 | 配置生成测试 |
| dev 主入站/额外入站生成 | 用 sam 私密配置副本生成，再由 sam 实际 Xray core 校验通过 | 不写入生产目录；主 UUID 列表及 WS 路径保持 |
| dev VMess 额外入站兼容 | 临时开启 VMess WS，生成及原生配置校验通过 | 生产 VMess WS 当前未启用 |
| dev 新生成 VLESS/VMess WS 双端 | 临时 Server/Client 两个真实 core，HTTPS 请求与 UDP/STUN 通过 | localhost WS 隧道，未经过公网 Nginx/TLS；测试输出中的 TLS 标签是复用探针的固定文字 |
| dev Rproxy VMess 双端 | 最新 Server 生成器与 ui-RproxyCsave 生成器，临时 core TCP/UDP 映射通过 | 临时 canonical 设置、localhost 端口；未接管现有映射 |
| 生产状态保留 | 六份配置的 SHA256、mode、uid/gid 前后相同，七服务 active，失败单元零，临时 Xray 进程零 | 见下方证据位置 |

## 发现的问题：旧 RproxyS 设置文件

sam 的 `/opt/de_GWD/RproxyS/settings.json` 使用旧的顶层字段：`port`、`uuid`、`clients`、`mapping`。

本轮 dev 的 `rproxyS_requireTunnel` 从 `.tunnel.port` 和 `.tunnel.uuid` 读取隧道身份；`rproxyS_init` 只在设置文件不存在/为空时从运行配置重建，不会转换已存在的旧格式文件。将 sam 设置文件复制到隔离目录后调用最新 `rproxyS_writeConfig`，返回非零并提示 `Configure a valid tunnel first`，稳定复现。

在仅有测试副本的目录移开旧设置，让同一份生成器从运行配置副本重建 canonical 设置后，配置生成、原生校验和临时双端 TCP/UDP 均通过。这定位到旧设置格式转换缺口，不是 VMess 隧道本身不兼容。

本轮没有修改生产旧设置或修复业务代码。当前运行的 RproxyS 仍正常。建议在操作 sam 的新 RproxyS 管理菜单前，先补齐保留隧道身份、额外用户与映射的旧格式兼容，并增加回归验证。

## 测试封装失败与修正

初版 Python 从安装脚本提取全部函数时，受到嵌入 shell helper 的函数定义影响，测试封装语法失败。改为显式提取依赖函数，并在执行前运行 `bash -n` 后，配置生成和双端检查通过。该问题属于本次临时测试封装，不作为仓库安装器缺陷。失败后与最终均核对生产配置及服务状态，未发现变化。

## 证据与清理

- sam 工作目录：`/root/dex-dev-test-20261106-4042408/`。
- 保留：测试源码、`baseline.json`（仅文件哈希/权限/属主）、`final-sanitized.json`。
- 已删除本轮生成的包含认证数据的 fixture、隔离配置副本与私密调试日志；临时 core 均停止。
- Nginx、vtrui、RproxyS、HAProxy 的 ActiveEnterTimestamp 均早于本轮，未发生本轮服务重启。

## 未完成范围

- 最新 dev 的完整安装/更新、OS 包升级、生产资源替换、主机重启验收。
- 独立外部 Client 的完整 TCP/UDP 与 LAN TProxy 数据面。
- 全部菜单 CRUD、WireGuard 握手与路由、生产 Rproxy 映射操作。
- 本地并发修改后的新版本验证。
