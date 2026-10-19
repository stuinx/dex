# 核心组件升级（2026-10-19）

## 最新状态（优先于下方实施前记录）

- 用户确认vm1224新指纹后，通过专用`/private/tmp/dex-components-20261019-knownhosts`连接，未覆盖原known_hosts。
- vm1224实测Xray26.3.27、SmartDNS Release48.4、mosdns5.3.4，与官方正式latest一致，保留不改，不采用预发布版本。
- Nginx1.30.6已构建amd64/arm64，部署sam、sgn、vm1224；HAProxy3.2.26 LTS已构建两架构、部署sam/sgn。现用核心替换前留存备份，原文件mode/owner保持。
- 本地工作区新增两架构核心/哈希、源码归档/许可证/来源清单、容器构建和隔离功能测试；Server补充HAProxy受管配置更新入口，下载/哈希/配置检查失败不替换，重启失败回退。Client/Server补充Nginx动态运行库的缺包检查。不改PHP/Pi-hole、原节点、菜单、README及其他核心归档。
- 用户已确认vm1224的FORWARD/Rproxy新增及RproxyC运行是另一个操作，要求保留现状继续；未恢复覆盖。最后只读复核三机相关服务及配置通过，本次升级范围没有观察到新增回归，可以提交并正常快进推送dev；不将sgn原有UDP超时改记为通过，不代表全项目所有功能验收通过。

## 本轮验收证据

| 项目 | 结果与边界 |
|---|---|
| Nginx来源 | 1.30.6官方归档，官方pluknet公钥验证签名通过；签名指纹记录于native-component-sources.json |
| HAProxy来源 | 3.2.26源码哈希与官网.sha256一致；选择维护中的3.2 LTS，不用3.5开发版 |
| amd64隔离功能 | HTTP、HTTPS、Brotli、WebSocket TLS握手、HTTP/2 ALPN，HAProxy配置/TCP转发均通过 |
| arm64隔离功能 | 同上通过；QEMU user-mode，不是arm64实机；HAProxy fixture设nbthread1，不证明多线程性能 |
| 三机现有配置 | 候选Nginx -t均通过；两Server候选HAProxy -c通过；替换后相关业务服务active |
| sam入站前后对照 | 主/额外VLESS WS、REALITY、SOCKS5均HTTPS200+UDP STUN通过 |
| sgn入站前后对照 | 主/额外VLESS WS、VMess WS、REALITY均HTTPS200；四类UDP均超时，升级前后相同，不宣称UDP通过或已修复 |
| 实际HAProxy | vm1224通过SO_MARK255绕过透明代理嗅探，sam20961与sgn52096均HTTP200 |
| 实际DoH | vm1224经sam443、sgn55443，校验真实TLS证书，DNS wire请求均HTTP200/application-dns-message；不等于严格DNS防泄露验收 |
| 配置保留 | sam/sgn Xray JSON、HAProxy配置前后SHA一致；vm1224 Xray JSON前后SHA一致；0conf仅FORWARD发生新增，用户确认是其他操作，原样保留 |
| 本地回归 | HAProxy升级7例、Debian12/13源依赖回归、NodeSM/VLESS-only、下载6例、DoH配置生成、资源/源码SHA链、Bash/Python语法与diff检查通过 |

测试过程更正：初版arm64 fixture遗漏独立Nginx的fastcgi/uwsgi/scgi临时路径，修正后Nginx通过；HAProxy在QEMU默认多线程fixture未正常监听，改为nbthread1及有界启动等待后通过。不将这两次测试失败隐藏或当作原生产故障。两个shell测试曾误用Node执行而报解释器语法错误，随后以Bash重跑通过，未因此改业务源码。

Nginx使用系统OpenSSL3/PCRE2/zlib和静态Brotli，未沿用旧的mimalloc/tcmalloc链接或未随仓库分发的Perl/XSLT动态模块。现有配置校验和数据面测试通过；不宣称配置外模块或HTTP3/性能完整验收。两架构源码及基底镜像固定，APT依赖不是快照锁定，不能声称逐位可复现。

## 备份与恢复

- 三机`/root/dex-components-20261019/before/`保存原核心及configs.tar.gz；本机私有目录`/private/tmp/dex-native-upgrade.5xwc5b/`也保留三机配置备份。含认证信息，不提交仓库、不打印。
- Nginx按同目录暂存、候选配置校验、原子替换、重启验证部署；失败路径可恢复before/nginx。HAProxy使用仓库真实helper，经仅监听127.0.0.1的临时资源服务测试更新，临时资源服务已退出。
- 临时构建容器全部退出，专用dex-native-build:20261019镜像已删除释放空间，可按配方重建；Pi-hole容器未动，最终vm1224磁盘约4.3GB空闲。源码及日志保留。
- 未重装、重置或重启整台主机；没有删除用户配置/应用数据。vm1224原有Exim4 failed未扩展处理。

## 实施前记录

用户确认范围：Xray、SmartDNS、mosdns、Nginx、HAProxy；sam/sgn + vm1224双端验收，通过后才推送dev。不升级PHP、Pi-hole及其他业务组件。不改变README。

## 本次核验

工作目录为codex/overall-optimization，最新本地提交db86718。当前Server主机sam/sgn可SSH连接；本轮仅执行只读版本/包查询，未替换核心或重启业务。

| 组件 | 仓库/现场 | 官方正式版本核对 | 处理 |
|---|---|---|---|
| Xray | 清单及sam/sgn26.3.27 | GitHub releases/latest为v26.3.27；26.10.17等标记prerelease | 保留正式版本，不将预发布当稳定版 |
| SmartDNS | 清单Release48.4 | GitHub releases/latest为Release48.4；nightly标记prerelease | 清单无需版本升级；vm1224运行版本待连接确认 |
| mosdns | 清单v5.3.4 | GitHub releases/latest为v5.3.4 | 清单无需版本升级；vm1224运行版本待连接确认 |
| Nginx | sam/sgn1.29.0 | 官方下载页Stable为1.30.6，Mainline为1.31.7 | 候选1.30.6，尚未下载构建或部署 |
| HAProxy | sam3.0.11-1+deb13u3；sgn2.6.12-1+deb12u3 | 官方提供3.4.7 LTS、3.2.26 LTS、3.0.30 LTS等 | 项目由APT安装，尚未变更安装来源或选定跨分支升级策略 |

sgn缓存APT候选为2.6.12-1+deb12u4，sam候选与已安装一致；没有运行apt update，不能把缓存候选称作最新仓库版本。

## 构建与兼容约束

- Xray/SmartDNS/mosdns与coredns/yq一起位于de_GWD两架构归档；不要连带升级不在范围的组件。
- Nginx两架构独立文件维护。现有1.29.0带静态Brotli/ngx_devel_kit、stream、HTTP2/3、SSL等，amd64还链接mimalloc；默认配置含brotli指令。不能无验证改用缺模块的普通官方包。
- 当前没有找到仓库Nginx可复现构建配方，sam未检测到gcc/make开发环境；尚未安装构建依赖。
- HAProxy当前通过server中的apt-get安装，升级不能只改现场二进制而遗漏项目安装/更新路径及systemd兼容。
- 双端测试应先留存基线和备份，沿用已知异常作为对照，不能将旧SOCKS5 UDP、Rproxy公网入口、HAProxy上游故障混同新版本回归。

## 最初的指纹阻塞（已由用户确认解除）

vm1224（10.0.0.224）相对本机known_hosts发生主机密钥变化。旧会话的临时known_hosts文件已不存在。新ED25519指纹：`SHA256:rmgqKqMFWWUbOarjL+5WramvGjxz1ujliFeIDYhvlro`。严格校验拒绝连接；已向用户请求确认主机身份，未关闭校验、未覆盖本机known_hosts。

该身份确认已收到，后续执行与未完成项以上方最新状态为准。

## 官方来源

- https://github.com/XTLS/Xray-core/releases
- https://github.com/pymumu/smartdns/releases
- https://github.com/IrineSistiana/mosdns/releases
- https://nginx.org/en/download.html
- https://www.haproxy.org/

通过agent-reach的GitHub CLI读取官方Release元数据，直接读取Nginx/HAProxy官方网站；Wigolo工具本会话不可用。以上是2026-10-19观测，不保证后续不变。
