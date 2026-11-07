# 当前交接：Client 更新的本机 DNS 故障已恢复（2026-11-07）

- 用户在 vm1225 运行 de_GWD Fast Update 时，`preDL` 无法解析 `gh.stuinx.eu.org`，报 IPchnroute checksum 下载失败。
- 根因：`/etc/resolv.conf` 指向 `127.0.0.1`，但 Pi-hole Docker 容器已退出（exit 137，非 OOM），本机 53/UDP、TCP 没有监听；SmartDNS/MosDNS 的 5331/5332 仍可解析。容器退出时间与本机 resolv.conf 更新时间相近，无法仅凭现有状态确定是谁停止了容器。
- 已执行 `docker start pihole` 恢复既有服务。确认容器 running，Pi-hole FTL 重新监听 `0.0.0.0:53` 的 UDP/TCP，`getent` 可解析更新域名；原校验 URL 返回 HTTP 200、65 字节 SHA256。
- 这次没有重跑完整 de_GWD 更新；已确认失败点是本机解析中断。再次更新前需考虑此前 code review 的 nftables 冷加载问题，避免更新重启 nftables 后数据面中断。
- 本次未改源码或持久 DNS 配置；Pi-hole 维持原有 `restart=always` 策略。主机 DNS 已恢复。

# 当前交接：PHP 8.5 首页空白已恢复（2026-11-07）

- 症状：优化更新后 vm1225 的寒月首页只显示导航页眉、主体空白。
- 根因：vm1225 的 Nginx 使用 PHP 8.5.12；页面模板将 `installed` 当裸常量比较，PHP 8 抛出 `Undefined constant "installed"` 并在页眉后终止。nginx/php-fpm 服务均 active，错误日志在截图时段记录了 index.php fatal。
- 修复：dev 的 `resource/client/ui-web/{index,nodes,update,app,forward,ddns}.php` 将 14 处裸常量比较改为字符串；客户端 Archive 已同步，SHA256 `dc010c06b6f073c8430c2cd5950a96ffb9dbfb73a4841ff940ee1b3cb596e907`。这一比较未在原优化差异中变更；PHP 8 运行时使原缺陷显现。
- vm1225 已做最小在线修复，六个旧页面分别保留于 `/root/dex-php85-blank-page-20261107-lm212wkj/`，模式/属主保留；未重启服务。Chrome 登录页重载后主体和节点、DNS、IP 区域完整显示；六页 PHP 8.5 lint 与 Nginx 配置检查通过。
- 本地验证：Archive 源码逐字节一致（1753 项）、release-chain 校验、`git diff --check` 通过。修复提交 `e5263ad` 已正常推送至 `origin/dev`，推送后本地工作区干净。
- 先前 code review 的其他发现仍未修复：SET_*.nft 持久化 `flush set` 导致重启冷加载失败；legacy Rproxy 迁移未校验 listen/TLS；ping/speed 对省略端口的旧节点拒绝。不得把本次页面恢复说成这些问题已解决。

# 当前交接：双端验收通过，代码已推送 dev（2026-11-06）

- 用户授权：sam验证并追加vm1225 Client验收；透明代理异常先修复再推送。该异常已修复并复测通过；实现提交bb90d40已正常快进推送origin/dev，不强推、不碰main、不创建Release。
- sam/vm1225源码回归、真实Xray TCP/UDP回环、各34项真实nft及vm1225→sam四种实际入口TCP/UDP均通过。HNN实际主VLESS是32087，旧32096是VMess兼容入口；LAX保留32096，新增32087转发，vm1225所选VLESS节点及2个outbound引用同步正确身份。最终透明HTTPS200、UDP/STUN通过，七服务active无failed。
- sam生产不变；HNN只读。vm1225仅0conf/runtime两文件内容变更、元数据保持，vtrui按需重启；LAX仅HAProxy追加规则并reload，原配置保留。精确备份位置、曾回滚的失败探针、临时数据清理及验证边界见docs/sam-vm1225-validation-20261106.md。
- 未执行完整安装升级、主机重启或完整浏览器/FPM验收，勿将隔离测试夸大。当前源码基线4042408，资源链与差异检查通过；临时HNN SSH控制会话已关闭、候选身份文件已清理，私密回滚备份保留。代码与测试已随bb90d40推送；继续工作前以git状态和远端HEAD为准。下一步若做完整安装/更新或重启验收，须另设明确测试范围。

# 当前交接：dev 本地全面优化（2026-11-06）

- 目标与范围：用户要求全面覆盖稳定性、安全性、性能和可维护性，保留功能；当前仓库为 dex-workspace/原始仓库/dex，分支 dev，基线 4042408。本轮源码与资源修改均未提交、推送、部署，不沿用历史推送/远端操作授权。
- 已完成：Web 鉴权/命令参数/6页输出编码/浏览器来源限制、session锁释放和测速时限；节点与FWD安全JSON及失败保护；分流完整身份保持；DNS hosts、nft候选与单批次刷新；定时更新锁与故障传播、限定清理；版本/key/WebUI/两端自动更新失败保护；canonical Rproxy额外用户生成；全量资源包一致性检查。普通节点/分流/FWD使用VLESS，Rproxy和Server额外VMess兼容保留。
- 已验证：17套Node本地回归、节点保存13项/FWD保存16项PHP回归、下载与DoH回归通过；91个Bash和86个PHP语法检查无错误或弃用提示，git diff --check通过。完整命令与边界见 docs/dev-optimization-20261106.md。
- 性能证据：相同fixture输出一致，ui-NodeSMcheck的jq调用53降至14；开发机单次617.2ms降至85.4ms，不能外推代理吞吐或生产整体性能。
- Archive已重打包：1753文件与源码逐字节一致，原条目权限、CRC/SHA256/发布链通过；SHA256 6d4171b754c85775bc589380dfe3979aed41b2dd14382ce8783f18c3399f7e92。
- 当前状态：本地改动可审查，工作区有本轮业务/测试/归档修改，以及另一聊天新增的sam报告；勿自动reset、清理、提交全部或覆盖报告。下方sam报告验证4042408快照，不代表本轮代码已实机通过。
- 未完成/阻塞：legacy Rproxy顶层clients的schema来源未知，无法证明等价迁移，原文件保持；PHP/Shell写锁与全流程事务未统一；GET接口未全面改POST/CSRF token，广泛sudo权限策略仍保留。不能宣称全部安全风险消除。
- 下一步：先审查本轮差异和报告，再使用脱敏legacy结构补兼容测试；最新代码须在授权的隔离Linux环境验收真实nft、完整安装/更新、重启、TProxy、外部TCP/UDP和浏览器交互后，再决定发布。
- 修改文件：client/server、相关ui-script、6个Web页面/auth/act handler、Archive与校验值、tools检查器及回归；详单以git diff --name-only和新报告为准。
- 已踩坑/恢复：独立复核发现并已修无端口旧节点切换、nft候选shebang/权限及持久文件提前覆盖问题。不要source整个安装器；本机服务/下载/nft/部分core校验为fixture模拟，无Linux nft或原生Xray环境，不得当作线上数据面证据。

# 当前交接：sam 非侵入测试（2026-11-06）

- 用户改为在 sam 测试 dev Server，已完成只读基线与临时目录测试；报告见 docs/sam-dev-acceptance-20261106.md。
- 测试输入为 dev 4042408 的 server/client 快照，上传 SHA256 与该提交一致；测试期间其他并发修改未上传，不属于本轮验证范围。
- 通过：现有主/额外 VLESS、REALITY、SOCKS5 的 sam 同机 HTTPS/UDP，外部 DoH，下载/DoH 参数回归，最新 dev 的 native Xray 配置生成、VLESS/VMess WS localhost 双端，以及 VMess Rproxy 临时双端 TCP/UDP。
- 新发现：sam 旧 RproxyS settings 顶层 port/uuid/clients/mapping 无法被 dev 的 .tunnel 格式管理逻辑直接识别。仅临时重建 canonical 副本后生成和双端通过；生产旧设置未修改，当前隧道未受影响。下一步先处理此兼容缺口，再考虑管理菜单或完整升级验收。
- 生产六份配置哈希/权限/属主前后相同；七服务 active、失败单元零；无本轮服务重启，临时测试进程已停止，含认证数据的临时副本已清理。
- 未部署最新脚本/核心、未安装升级系统、未重启主机、未推送。不能称完整生产升级验收通过。
- 本地存在其他并发业务改动，本轮保留原样，仅新增本报告与本段交接，未提交它们或其他修改。恢复工作前先核验当前 git 状态，不按下方历史“工作区干净”记录操作。

# 当前交接：dev 合并 vless 与协议范围确认（2026-11-06）

- 用户最终确定：main 仅基于原 main 做 fix，普通节点保留 VMess；dev 的普通节点、分流和 FWD0/FWD1 使用 VLESS；Rproxy 内部隧道与 Server 额外入站的 VMess 兼容保留，不再迁移这两处。
- 此目录分支 dev，已从 1300776 快进至 b513aae，完整包含原 vless 的 e549922、b513aae；本轮后续仅更新范围说明和交接，无新运行逻辑改动。
- 本轮已通过：普通节点 VLESS-only、FWD 配置与身份匹配、分流、节点保存 UI/PHP、Debian 12/13 模拟、SOCKS5 出站/UDP、HAProxy 升级回退、下载、DoH 参数、脚本语法、资源链与差异格式检查。相关测试位于 tools/test-*。
- 未做：线上部署、全新安装、重启、Linux TProxy 和真实双端数据面验收；历史实机报告不作为本次验证。
- main 最终修复提交为 06dd842，目录 dex-workspace/main-fixes；此前 main-integration / codex/main-features-draft 为被新范围取代的本地草稿，不能作为 main 交付版本。
- 用户要求暂不推送；本次没有推送、远端写入或修改旧备份仓库。
- 下方交接为历史记录。旧的推送授权与未提交状态均不覆盖本段当前约束。

# 当前交接：整体优化隔离分支（2026-10-17）

- 2026-10-19升级最终复核：用户确认vm1224 Rproxy新增属于其他操作，要求保留并继续；已保留并只读复核三机，本次组件升级范围无新增回归。准备提交并正常快进推送dev；不创建Release、不改README，不把sgn原有UDP超时视为修复或全项目通过。以本条覆盖下一条“等待并发确认”的状态。
- 2026-10-19最新：用户确认vm1224指纹后已继续；三台Nginx升级1.30.6、sam/sgn HAProxy升级3.2.26；两架构资源/源码/哈希、构建与7例回退测试已落地，amd64及arm64 QEMU功能通过。sam TCP/UDP、两台实际HAProxy/DoH通过；sgn UDP前后同样失败属既有出口链路。未提交推送：vm1224在19:09新增FORWARD/Rproxy并启动RproxyC，非主代理写入，已请求用户确认并发来源；不覆盖该变化。原核心配置备份在三机/root/dex-components-20261019/before和本机私有临时目录；专用构建镜像已清理。详见docs/component-upgrade-20261019.md。先核验当前状态/用户回复，再决定补验及推送；README不改，Xray/SmartDNS/mosdns正式版不变，不重跑已通过测试。
- 用户已明确要求推送到dev；本次提交包含当前隔离分支的既有适配和三批优化、测试/验收报告。推送目标为origin/dev，使用正常快进，不强推，不更改原dev/vless工作区。验收三条异常与缺口不因推送而视为解决；不创建Release。
- 最新完整验收：Luna Medium执行回归/三机只读/DoH过期测试；主代理实际浏览器、入站、分流、RproxyS、HAProxy复核。暂不全通过：sgn默认SOCKS5 UDP、sgn公网RproxyS55500、sam HAProxy55443上游异常；WG/全CRUD/NodeDT/新完整安装仍有缺口。优先读docs/full-acceptance-20261017-main.md，原始报告full-acceptance-20261017-luna.md。
- 浏览器添加/报错/保存/排序/删除通过，原0conf/runtime hash恢复一致；13项NodeSM、自定义和默认出口真实命中通过；过期证书拒绝主代理复跑通过。临时进程/转送停止，三机主要服务active。路由测试初版误触一次SmartDNS重启，未改配置，已隔离重跑通过。本轮未修业务源码/重装/重置/改权限/推送。
- 最新：Luna max 三批已交付并停止（子代理已关闭可恢复）。节点保存校验/失败提示/401；client/server 有界下载；DoH 正确证书验证。主代理独立回归通过，sam/sgn/vm1224 各六项隔离下载通过；vm1224 对三台 DoH 正确证书/错误主机名反证通过。
- vm1224 页面和 ui-smartDNS/DoH 行已部署，重启后9项服务、DNS、401、Xray、TCP/UDP正常。配置 hash 和文件mode/owner不变。sam 未重装，Server 未完整重装/更新，仅临时目录测试下载函数。
- Archive 已最终同步，SHA256 f268e0ca9102369ccf95eb4440e4ef0e09cde011cbfe57150e6ac31ab53513fe；CRC/源码逐字节/原ZIP条目权限通过。所有相关回归通过。仍未提交/推送/发布。
- 整体路线图尚未全部实现，不得标记全部完成；后续范围与边界见 docs/overall-optimization.md。浏览器交互和过期证书已补验；直接写目标的辅助下载尚无原子保护。先读最新条目，不按下方历史“实施中”状态重复部署。
- 分支 codex/overall-optimization，目录 /Users/stuinx/.codex/worktrees/dex-overall-optimization；复制原 dev 未提交成果，原 dev/vless 不覆盖。初次复制漏同步 4 个 FileRun/MariaDB 已删除文件，主代理已补删，确保保持用户要求的基线。
- 实施子代理 GPT-6 Luna max（01a1475a-ea72-72d0-8522-97319dcda943），主代理独立验收。第一批 nodes.php/NodeSave.php 输入校验、失败提示、未登录 401 已部署 vm1224；12 项 PHP 回归、保存 handler 和 VLESS-only 回归通过，实际未认证 HTTP 401，配置 hash/文件权限属主不变，TCP/UDP 正常。远端可恢复备份 /root/dex-debian13-test/optimization-20261017/。
- 第二批 client/server 下载有界超时重试实施中，尚未验收部署；Archive 尚未纳入第一批新增修改，最终必须重打包校验。
- sam Debian13、sgn Debian12 主要服务 active，Nginx/Xray 配置校验通过；vm1224 到两台 HTTPS/证书验证 DoH 通过。vm1224 原有 exim4 failed，未处理。
- 用户允许必要时重装 sam，但尚未执行；须先备份核验与访问路径确认。禁止将用户提供的明文密码写入交接、日志或仓库。
- 后续整体优化阶段尚未完成，详见 docs/overall-optimization.md；不擅自改权限、不重置 sgn/vm1224、不提交推送发布。第一批浏览器人工点击仍未完成，只有真实 handler/实际 PHP 路径测试。

# 历史交接：Debian 13 适配与 Meta AI（2026-10-13）

- 2026-10-13 最新页面已部署 vm1224：6 个 PHP 文件语法通过，部署前后模式/属主一致；FileRun/MariaDB 4 个旧入口移到 /root/dex-debian13-test/ui-acceptance-20261013/retired，可恢复，原文件另有 before.tar。普通节点页面无 Protocol 列/选择框，NodeSave 实际程序隔离校验 VLESS 接受、VMess 拒绝通过。9 项业务服务 active，TCP/UDP 复测见本轮结果；未删除用户数据库/文件数据。Chrome 未找到截图对应登录标签，未完成浏览器点击添加/保存/排序，不宣称全 UI 交互验收。未提交/推送。
- 节点管理 Protocol 列已按用户要求移除（已有行及新增行）；保存时固定 protocol=vless，数据列索引和排序操作保持正确。PHP 语法、VLESS-only 保存回归、ZIP 源码一致性通过。最新 Archive SHA256：bfcd8640911a7697a18e1441464fe0a132b3bf884ae333205d3ff4bf5e69dfee。未部署/提交/推送。
- 用户要求移除 FileRun/MariaDB：已删除 6 个页面中的检测/导航、应用页按钮/事件及 4 个专用安装文件。未卸载现有服务或删除用户数据，未新增权限行为；原 installWebUI 已清理旧 ui-* 和 act 目录，无需额外清理代码。Archive 更新为 1769 条目，源码一致、CRC/PHP 语法通过（本机新 PHP 对原有字符串语法报告弃用警告，未扩大修改）；最新 SHA256 为 94a0af34e3bdc0954cdd53adf1bf4f007388f7329320234936a482dbb20ec89c。仅本地变更，未部署/提交/推送。
- Client VLESS-only 最终重启复验已通过：vm1224 9 项业务服务 active、Xray 配置正常、透明 TCP/UDP 同为 LAX 出口；本次重启后失败单元为空。此前 Exim4 故障未主动修复。临时本地 18080 资源服务已停止，SSH 反向转送随重启断开。Archive 1773 条目与源码一致、校验通过，未提交/推送。
- 后续用户授权 SOCKS5 NAT UDP 修复与双端测试：`server` 已从 SOCKS5 配置域名解析 IPv4 并生成 `settings.ip`，更新检查入站生成失败；新增 `tools/test-socks5-udp.cjs`，红/绿回归通过。sam 实际更新与再次重启后，vm1224 SOCKS5 TCP/UDP 均通过。无需临时配置补丁；Server 55 VMess 保留，未新增权限修改，未提交/推送。
- 用户已确认：只删除普通节点与分流中的 VMess，保留 FWD/Rproxy 内部隧道协议。Client、节点页面/保存、切换、测速及分流生成/状态检查已改为 VLESS-only；旧普通节点清理而非自动转换，默认 VMess 节点会阻止更新，须先选择有效 VLESS。Server 55 VMess 未移除。vm1224 完整更新返回 0、旧节点/分流清理、13 项分流生成、Xray 校验、HTTPS 和透明 UDP 已通过，重启复验进行中。详见 docs/client-vless-only-acceptance.md；未提交/推送。
- sam Server 验收经用户确认后已启动。初始 Debian 12、Zabbly 7.2.4，业务服务正常。配置备份 `/root/dex-debian13-test/before-upgrade.tar` 已复制到本机 `/private/tmp/dex-sam-debian13.bRyZDi/` 且 SHA256 一致；本次没有创建或验证提供商整机快照。
- sam 升级返回 0，运行 Debian 13 / Zabbly `7.2.10-zabbly+`。新 dev Server 更新及再次重启完成，业务服务正常、失败单元 0、NTP Normal，主 UUID/PATH 保持，主协议迁移为 VLESS。
- sam 旧 extra JSON 与当前格式不同且保存值与运行值不一致；已保留原始备份，以升级前运行配置为准迁移。最终额外入站端口、UUID/PATH、账号、REALITY 设置及转发目标核对一致，SOCKS5 35353 保留。临时脚本在 `/private/tmp/dex-sam-debian13.bRyZDi/`，不代表仓库已实现自动迁移。
- sam 首次双端验收：主/额外 VLESS WS TCP+UDP、REALITY HTTPS、SOCKS5 TCP、DoH、33332 TCP 转发、LAN TProxy 和重启复验通过，vm1224 原配置恢复 LAX。当时 SOCKS5 UDP 握手返回内网地址、单变量改公网后通过；后续正式修复及验收已完成，见首条和 `docs/debian13-sam-acceptance.md`。
- vm1224 Exim4 在 sam 测试开始前已因绑定被禁用的 `::1` 失败，代理/DNS正常；未扩展修改邮件服务。sam 证书/私钥仍为原有 644，未手动改权限。日志已保存本机测试目录；未提交/推送。
- 当前工作区：`/Users/stuinx/.codex/worktrees/dev-debian13/dex`，分支 `dev`，基于 vless 最新 `6ede570`，主协议 VLESS，未提交/推送。原 dev 已保留为 `codex/dev-before-debian13-20261013`，其 NodeSM 未提交改动仍在原 `dev-nodesm/dex` 工作区；原 vless 工作区未覆盖。
- 用户新增授权：先在 vm1224 测试已有 Debian 12 Client 直接升级至 Debian 13；第一阶段验收通过后恢复 init，再升级 Debian 13 并全新安装 dex。PVE 升级前恢复快照为 `codex-before-debian13-20261013`。
- 已实现：Debian 13 的四组 Debian 源使用 trixie；mimalloc 依赖使用 libmimalloc3；Sury 源读取 VERSION_CODENAME；缺少 apt-key 时跳过旧密钥清理。Client/Server 与内核调优脚本为 trixie 建立 `/etc/sysctl.d/99-de-gwd.conf` 到 `/etc/sysctl.conf` 的链接，使现有运行时修改在启动时也能加载。
- 已核验资源：Docker/Zabbly trixie Release、Sury trixie 两架构的 PHP 7.4 包、Debian libmimalloc3。现场发现现有 amd64 Nginx 仍需 ABI 2，已将官方 Debian mimalloc2 库、来源、版权和 SHA256 纳入仓库；Client/Server 缺少该 ABI 时按需安装私有兼容库。arm64 Nginx 使用 google-perftools，Server 在 trixie arm64 补装该依赖。未替换 Nginx 核心或混用 bookworm APT 源。
- Debian 13 修改文件：`client`、`server`、`resource/kernel/installkernel`、`tools/test-debian-suites.cjs`、`README.md`、本交接。此前 Meta AI 变更仍在 NodeSM 两个脚本、网页 index/NodeSMrules、test-nodesm、Archive.zip 与其校验文件中，已同步归档。
- 验证：`node tools/test-debian-suites.cjs` 在隔离目录执行安装/更新源配置、依赖函数、Sury 密钥处理、sysctl 链接及内核启动调优；APT、下载、包状态和 sysctl 为模拟，不是 Debian 13 实机安装。`node tools/test-nodesm.cjs`、`node tools/test-socks5-outbound.cjs`、`bash tools/check-self-owned-release-chain.sh` 已通过；`bash -n client server resource/kernel/installkernel` 与 `git diff --check` 已通过。
- 新 dev 的迁移测试旧 PATH 断言已同步为此前确定的 UUID 末六位；迁移/回滚/共存/新安装/协议保持回归通过。原 vless 工作区的测试未改动。
- vm1224 第一阶段已升级至 trixie，并重启至 `6.12.111+deb13-amd64`。原默认 VMess 节点与 LAX VLESS 主入站不匹配，已先核验相同 UUID/PATH 后同步协议。旧 Docker keyring 的签名验证问题通过项目现有 ASC/deb822 方法处理，未绕过校验。
- 新 dev Client 的 Debian 13 完整更新返回 0；更新后再次重启的服务、Nginx/PHP/Xray 配置、DNS、策略路由、HTTPS 与本机透明 TCP/UDP 通过；PVE 经 vm1224 的 LAN TCP/UDP 也通过。通过快照 `codex-debian13-upgrade-ok-20261013` 已保存，日志在 `/private/tmp/dex-debian13-logs.dcWpTb`。
- 第二阶段 init 基础系统升级返回 0，新 dev Client 全新安装重试返回 0，安装后再次重启的服务、DNS、配置、策略路由、本机与 LAN TCP/UDP 通过，失败单元 0，NTP Normal。LAX 主 VLESS 和额外 VMess 数据面均通过；Meta AI 实际命中专用分流但网站返回 403，不能宣称网站可用。临时节点和日志配置已恢复，默认 LAX VLESS。
- 现场网络边界：首次规则更新下载加速站点校验文件持续等待，默认链路短超时复验失败。保留日志并停止测试单元后，通过 SSH 转送原始文件和校验值重试成功；默认下载逻辑未改。第二阶段恢复快照为 `codex-debian13-fresh-ok-20261013`，日志同样保存至 `/private/tmp/dex-debian13-logs.dcWpTb`。
- 已观察既有行为：开机内核清理移除内核元包；原安装器递归权限行为使 0conf 由初始 666 变为 777，Xray 配置仍为 644。本轮未新增 chmod/chown，不得报告安装前后权限完全相同。
- 当前本地资源由 `python3 -m http.server` 监听 127.0.0.1:18080，并经 SSH -R 转发到 vm1224 的 127.0.0.1:18080；重启会断开 SSH 转发，需重新建立。验收脚本在 `/private/tmp/dex-debian13-*`，远端日志在 `/root/dex-debian13-test/`，完整过程见 `docs/debian13-vm1224-acceptance.md`。恢复 init 前先保存日志与第一阶段通过快照。
- 后续默认链路复验：重启后不带转送变量运行 `timeout 40 bash /opt/de_GWD/ui_4am`，返回 0，默认在线规则更新通过。首次安装等待及转送重试日志保留，不得宣称首轮无干预成功。
- 当前边界：sam Server 已有安装升级及双端验收完成；Server 全新安装、arm64 实机未验证。两阶段 Client amd64 及默认规则更新复验已完成；sam 验证了 Zabbly 7.2.10。SOCKS5 NAT UDP 已修复并验收，旧 extra 自动迁移尚未纳入代码。Client VLESS-only 已实施，内部隧道保留。未授权推送或覆盖远端旧 dev。

---

# 历史交接：VLESS 主协议分支（2026-09-26）

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
