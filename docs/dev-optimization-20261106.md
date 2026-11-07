# dev 优化与本地验收（2026-11-06）

## 2026-11-07 后续 PHP 8 兼容修复

- vm1225 在更新后出现首页仅显示页眉、正文空白。活动 Nginx 指向 PHP 8.5.12；错误日志记录 `index.php` 因未加引号的 `installed` 常量而 fatal。对应比较在此前优化差异中未修改，更新后的 PHP 8 运行时使遗留写法失效。
- 六个 Web 页面共 14 处 `=== installed` 改为 `=== 'installed'`，并同步重打包客户端 `Archive.zip`。vm1225 六个线上页面已用相同最小修复恢复，更新前副本备份至 `/root/dex-php85-blank-page-20261107-lm212wkj/`。
- 验证：Chrome 原登录页重载后节点表、DNS 和 IP 配置区均显示；六页 PHP 8.5 lint、Nginx 配置、Archive 1753 项源码逐字节检查、release-chain 检查和 `git diff --check` 通过。修复提交 `e5263ad` 已正常推送至 `origin/dev`。

## 范围与基线

- 用户要求全面覆盖稳定性、安全性、性能和可维护性，保留现有功能。
- 仓库：`dex-workspace/原始仓库/dex`；分支 `dev`；基线 `4042408`。开始时工作区干净，领先本地记录的 `origin/dev` 3 个提交；本轮未刷新远端引用。
- 普通节点、预定义/自定义/默认分流和 FWD0/FWD1 使用 VLESS；Rproxy 内部 VMess 和 Server 额外入站 VMess 兼容保留。
- 本轮实现提交`bb90d40`已在后续sam/vm1225验收及透明代理修复后正常推送origin/dev；未执行完整源码部署、主机重启或完整安装器。没有调整代理/DNS 默认策略或升级第三方核心。
- 并行任务追加的 `docs/sam-dev-acceptance-20261106.md` 和对应交接保留；该报告测试的是 `4042408`，不作为本轮修改后的实机验收。

## 已完成的改动

| 范围 | 原问题与改动 |
|---|---|
| Web 接口 | 9 个状态/测速接口补鉴权；动态命令参数增加类型、范围校验和 Shell 转义。 |
| Web 输出 | 节点属性和页面配置输出按 HTML 上下文编码；动态文本采用 `.text()` / `.val()`，避免备注、节点名、WS path、更新命令等作为 HTML 执行。 |
| 浏览器请求 | 在 session 打开前拒绝跨站 act 请求和不匹配的 Origin/Referer；保留无浏览器头的已认证 CLI 使用。新会话 Cookie 设置 HttpOnly、SameSite=Strict，并按实际 HTTPS 设置 Secure。 |
| 请求并发 | 鉴权后及时释放 PHP session 锁；测速总时限 30 秒、TCP 延迟测试 5 秒，避免长请求串行阻塞同一登录会话。 |
| 节点生成 | 统一复用已有 outbound builder，以 `jq --arg` 构造 JSON，正确处理引号/反斜杠路径；暂存成功后发布，保留已有运行配置元数据。历史省略端口的节点继续使用 443。 |
| 分流身份 | 保存并匹配 domain、UUID、path、protocol、TLS；预定义、自定义和默认分流重建后不因同地址或排序变化换节点。旧记录歧义时拒绝，保留原运行配置，要求重新选择。 |
| FWD | PHP 与 Shell 校验全部 UUID；安全生成 JSON；FWD1 不再先删除整个运行目录。 |
| DNS | 多行 hosts 与 DoH bootstrap hosts 全部进入 mosdns；Python 直接读数据，避免 Shell 展平换行和嵌入源码；生成配置变化才自动重启 mosdns。 |
| nft 更新 | CHNROUTE、GlobalDNS、V2NODE、黑白名单及 LAN 分流集合采用候选文件、`nft -c -f` 校验和单批次 flush/填充；成功后才替换持久规则。保留已有规则权限，shebang 位于首行。 |
| 定时任务 | 规则更新使用独立 flock，避免停止整个 cron；7 份资源下载有界且全部校验后才发布。清理只删除 dex 明确拥有的垃圾；有效 JSON 才进入备份。DNS 更新处理全部 r/n 参数并传播错误。 |
| 安装与更新 | 版本文件、Docker/Sury key 先暂存，失败或空响应保留旧文件；WebUI 解压成功并检查必需文件后才替换；更新脚本下载、非空和语法验证成功后再改变服务，不再提前停 nftables/改 resolv.conf。 |
| 自动更新 | Server/Client 不执行失败下载或语法错误的部分脚本；Client 下载通过后才停 PHP，退出时恢复，并保留安装失败返回码。 |
| Rproxy | canonical 设置中启用的额外用户真正写入生成配置，主隧道身份仍在首位且去重，协议保持 VMess。 |
| 资源一致性 | 发布链从单文件抽查改为核对全部客户端资源的文件集合、重复条目和逐字节内容。 |

## 性能测量

同一份本地 fixture、13 个预定义分流标签、前后输出一致：

| 指标 | 基线 | 本轮 |
|---|---:|---:|
| `ui-NodeSMcheck` 的 jq 进程调用 | 53 | 14 |
| 本机单次耗时 | 617.2 ms | 85.4 ms |

这是一台开发机的一次隔离测量，只证明该状态检查的进程开销降低，不代表网络吞吐、代理延迟或生产环境整体提速。`ui-NodeCUcheck`、`ui-NodeDTcheck` 和 `ui-checkNode` 也合并到单次 jq，并补全 TLS 身份匹配。

## 验证与当前状态

- 已通过全部 17 套本地 Node 测试；15 套后端和 2 套 Web 安全/来源/输出回归全部通过。
- PHP 节点保存 13 项、FWD 保存 16 项、原下载故障回归、DoH 参数回归通过。
- 新故障测试覆盖安装失败保护 29 项、维护脚本 7 组、DNS 5 组、Rproxy 原有6场景与新增8组窄迁移场景、自定义/默认分流重建、命令参数与 HTML 输出。
- Bash 静态语法检查 91 文件、PHP 静态语法检查 86 文件通过；最终无语法错误或弃用提示。
- 归档检查器以相符、过期内容、缺文件、已删除文件仍残留和重复 ZIP 条目五类 fixture 验证。
- 全部测试只在本机临时目录运行，系统服务、APT、下载、nft、部分原生核心校验为模拟；DNS fixture 对 toml 使用契约替身。
- 最终 Archive 已重打包，1753 个文件与源码逐字节一致；原 ZIP 条目权限保持，CRC、SHA256 和发布链检查通过。
- Archive SHA256：`6d4171b754c85775bc589380dfe3979aed41b2dd14382ce8783f18c3399f7e92`。
- `git diff --check` 通过；后续实现提交`bb90d40`已正常推送，实机配置修复与范围见双端验收报告。

主要验证命令：

```bash
node tools/test-web-safety.cjs
node tools/test-web-origin-output.cjs
node tools/test-install-failure-safety.cjs
node tools/test-maintenance-runtime.cjs
node tools/test-dns-runtime.cjs
node tools/test-custom-routing.cjs
node tools/test-rproxy-settings.cjs
node tools/test-nodesm.cjs
node tools/test-client-vless-only.cjs
node tools/test-debian-suites.cjs
node tools/test-fwd1-config.cjs
node tools/test-fwd1-upstream.cjs
node tools/test-haproxy-upgrade.cjs
node tools/test-node-save-ui.cjs
node tools/test-socks5-outbound.cjs
node tools/test-socks5-udp.cjs
node tools/test-vless-migration.cjs
php tools/test-node-save.php resource/client/ui-web/act/NodeSave.php all
php tools/test-forward-save.php
bash tools/test-download-reliability.sh
bash tools/test-smartdns-doh-config.sh
bash tools/check-self-owned-release-chain.sh
git diff --check
```

## 未解决与验收边界

1. 后续sam实测已补齐空 clients 的 legacy 顶层格式窄迁移：仅在运行配置身份及映射严格等价时转换，保留旧字段、元数据和一次性备份；实际私密副本迁移及原生core校验通过。未知非空clients和不匹配runtime仍拒绝。详见后续双端报告。
2. NodeSave/FWD 使用 `LOCK_EX`、坏 JSON 拒绝和完整写入检查；尚未统一所有 PHP/Shell 写入锁，也没有覆盖整个安装/配置流程的全量事务回滚。
3. 浏览器来源限制和 Cookie 属性属于当前兼容加固；接口仍普遍使用 GET，没有完成全局 POST/CSRF token 改造。现有 www-data 广泛 sudo 权限策略保留，未完成权限隔离。
4. 本机没有可用的 Linux nft 或原生 Xray 执行环境；真实 nft 事务、完整安装/更新、重启、Linux TProxy、独立外部 Client TCP/UDP、完整浏览器交互及 arm64 实机仍须后续验收。

## 修改文件与恢复

- 入口：`client`、`server`。
- 运行脚本：`resource/client/ui-script/` 下本次节点/FWD、DNS/nft、定时任务、Docker 与更新相关脚本；完整清单以 `git diff --name-only` 为准。
- Web：6 个页面、`auth.php`、相关 act handler，以及新增共享 `_request.php`。
- 工具：新增完整 Archive 检查器和 7 份针对性回归；更新现有 Debian、FWD、NodeSM、迁移 fixture。
- 打包文件：`resource/client/Archive.zip`、对应 SHA256 文件已同步。
- 独立复核曾发现 NodeChange 拒绝无端口旧节点，以及 nft 候选 shebang/持久文件提前替换问题；均已修补并补回归，不要按早期中间版本重新覆盖。
- 继续前先核对当前分支、差异和本报告最终状态。勿 source 整个安装器，勿把本机 fixture 通过当作线上验证。不要自动 reset/清理当前工作区或推送，其中还包含其他聊天的报告。

后续实机进展见 `sam-vm1225-validation-20261106.md`：隔离源码、原生Xray/nft及vm1225→sam双端均通过；vm1225现有HNN默认链路异常仍在定位，按用户要求暂不推送。

最终双端验收及透明代理修复已通过，详见 `sam-vm1225-validation-20261106.md` 顶部最终记录；后续按用户授权正常推送dev。

发布记录：实现提交`bb90d40`已正常快进推送origin/dev；main未变更，无Release。
