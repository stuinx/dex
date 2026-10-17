# 整体优化执行与验收

## 工作边界

- 分支：codex/overall-optimization，基于 dev 当前未提交成果复制，原工作区不变。
- 实施：GPT-6 Luna，max；独立验收由主代理负责。
- Server：sam（Debian 13）、sgn（Debian 12）；Client：vm1224（Debian 13）。
- 不重置、不改权限、不移除内部隧道、不卸载用户应用或删除用户数据；不自动提交、推送、发布。

## 顺序

1. 节点保存失败提示及输入校验，回归与 vm1224 现场验收。
2. 安装更新下载、资源一致性和失败保护；先检查现有实现，按实际缺口最小修补。
3. DNS 证书验证与可见性；改变解析模式或网络接管前明确行为边界。
4. 分流诊断、组件及菜单检查，逐项独立验收，不整体重写。

## 本次只读基线

- sam：nginx、vtrui、doh-server、unbound active，无失败单元。
- sgn：上述四项 active，无失败单元。
- vm1224：smartdns、mosdns、vtrui、nftables、nginx、php7.4-fpm active；exim4 failed 为修改前状态，不纳入本轮修复。

## 第一批验收（2026-10-17）

- Luna 实施节点字段校验、失败提示、部分填写行送服务端校验；主代理要求补充未认证 HTTP 401，已完成。
- 主代理独立运行 12 项 PHP 保存测试、真实页面保存 handler 成功/失败测试、VLESS-only 回归，均通过。
- 已部署 vm1224 的 nodes.php、act/NodeSave.php，备份在 /root/dex-debian13-test/optimization-20261017/，可恢复。
- vm1224 PHP 7.4 的 12 项真实程序隔离测试通过；实际 HTTPS 未登录请求返回 401；0conf/Xray 配置校验值未变；部署文件模式、属主未变。
- vm1224 透明 TCP/TLS、UDP STUN 均通过，出口一致。
- sam、sgn Nginx/Xray 配置校验通过，vm1224 分别访问两台 HTTPS 返回 200；第一批没有改 Server。
- 无 vm1224 已登录浏览器标签，故未宣称完成浏览器点击添加/保存/排序；已用真实 handler 和实际 PHP 路径测试。

## 第二批验收

- client/server 资源下载增加连接超时、有限重试；wget 使用外层总时限。保留来源、原有校验及权限行为。
- 主代理在 sam、sgn、vm1224 上分别运行相同隔离脚本，Client/Server 的传输失败、校验不匹配、成功替换共 6 例，三机全部通过（Debian Bash 5.2）。
- 测试提取真实 repoDL/checkSum，模拟下载和 ZIP 工具；不是网络故障注入，也不是完整安装升级。
- 发现并修正测试脚本 /tmp 重复路径替换及 Server ZIP mock 缺失两项问题；保留这段失败历史，不把早期 macOS 通过当作 Debian 验收。
- Docker/Sury 密钥和 version.php 等原有直接写目标路径不具备本批所证明的原子替换保护；尚未实现全量配置回滚。
- 仅上传测试源码到三机 /root/dex-optimization-20261017/，未运行完整安装器或替换业务核心；sam 未重装。

## 完整验收补充（2026-10-17）

Luna Medium执行回归/只读检查，主代理双端数据面及浏览器复核，详见`full-acceptance-20261017-main.md`。浏览器保存排序和过期DoH证书缺口已补验；13项预定义/自定义/默认路由真实命中通过。sgn默认SOCKS5 UDP、公网RproxyS55500、sam HAProxy55443上游异常；WireGuard/完整CRUD/NodeDT等仍未覆盖。整体暂不放行。未推送发布；下方为先前批次的时间点记录。

## 当前状态（先前批次记录）

- 第三批 DoH 证书验证已由 Luna 实施并由主代理验收；不新增严格 DNS 模式、不接管终端 DNS、不调整原分流默认行为。
- 官方参数依据：https://pymumu.github.io/smartdns/configuration/ 。须对现有核心实测正常证书与错误主机名；仅 curl TLS 通过不能替代 SmartDNS 验证。
- 主代理已在 vm1224 原核心使用独立 15332/15333 监听，对 sam、sgn 分别验证固定 IP + 正确 SNI/HTTP Host/证书主机名可解析，错误证书主机名无答案且进程仍 active；临时实例已停止，现用 DNS 配置未修改。尚未验证过期证书场景。
- vm1224 已更新 ui-smartDNS 和现用 DoH 行，仅按原固定 IP/端口/PATH/分组启用 SNI/HTTP Host/证书身份校验。0conf/Xray 配置 hash 与涉及文件 mode/owner 均未改变。
- 最终重启后，9 项主要服务 active、DNS 正常、Xray 配置通过、实际未登录保存 HTTP 401、透明 TCP/TLS 和 UDP 均通过；本次重启后无失败单元。不据此声称曾出现的 Exim4 问题已永久修复。
- 最终本地全套节点保存/页面 handler/NodeSM/协议迁移/Debian 源/SOCKS5/下载/DoH 生成及资源链检查通过。
- Archive 与全部资源逐字节一致、CRC/SHA256/原 ZIP 条目权限核对通过；最新 SHA256：f268e0ca9102369ccf95eb4440e4ef0e09cde011cbfe57150e6ac31ab53513fe。
- sam 未重装；没有执行完整 Server/Client 安装器来代替隔离测试。Server 下载修改只在临时测试目录验收，不宣称新完整安装升级通过。
- 之后批次均为计划，不是已完成结果：严格 DNS/接管、全量配置事务与回滚、资源版本锁定、组件升级、安全审查及完整浏览器交互仍未完成。未提交、推送或发布。
