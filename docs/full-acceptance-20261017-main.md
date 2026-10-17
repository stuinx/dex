# 双端验收复核（2026-10-17）

## 结论与范围

**暂不满足完整功能验收通过条件。** GPT-6 Luna Medium 执行本地回归、三机只读检查及过期 DoH 证书测试；主代理独立执行浏览器、真实入站/分流/转发数据面测试，复跑过期证书测试。三条现存链路异常，部分管理流程未完整覆盖；不是所有异常都已证明是仓库代码缺陷。

分支 `codex/overall-optimization`，HEAD `6ede570` 加未提交修改。本轮仅新增验收脚本、更新报告，没有改业务源码，没有提交/推送/发布，没有重置或重装主机、修改现有文件权限或 Server 业务配置。

## 已通过与边界

| 项目 | 本轮证据 | 边界 |
|---|---|---|
| 本地回归/资源链 | Luna 报告中的节点保存、VLESS-only、NodeSM、Debian 源、SOCKS5、下载、DoH 生成测试、PHP/Bash 语法、ZIP CRC/SHA256、资源链通过 | 隔离回归不等于完整安装升级 |
| 三机服务 | sam/sgn Nginx、Xray、DoH、Unbound、HAProxy、RproxyS active；vm1224 SmartDNS、MosDNS、Xray、nftables、Nginx、PHP active；采样时失败单元为空 | 不证明全部功能数据面或永久消除历史故障 |
| 浏览器节点 | 实际登录 vm1224 添加临时节点、非法 UUID 报错保留输入、合法保存、上下排序及刷新持久、删除测试行；无 Protocol 列 | 未逐一浏览器测试全部非法字段 |
| 应用页 | FileRun/MariaDB 入口不再显示 | 未卸载应用/删除数据 |
| sam 入站 | 主/额外 VLESS WS、REALITY、SOCKS5 均 HTTPS 200 + UDP STUN 通过 | 额外 VMess 未配置 |
| sgn TCP 入站 | 主/额外 VLESS WS、额外 VMess WS、REALITY 均 HTTPS 200 | UDP 失败，见下；VMess 用独立原生 core 测 Server 兼容，不重新加入 Client 普通节点 |
| NodeSM/NodeCU | 真实生成器在临时目录运行，13 项预定义命中各 nodeSM 标签、自定义 example.net 命中 custom、example.com 命中 default，共15项 | 部分站点403/421仅证明路由命中，不证明解锁；NodeDT 未现场覆盖 |
| RproxyS sam | 实际运行22000隧道/22003映射，临时 Client 使用真实 ui-RproxyCsave 生成部分，TCP/UDP通过 | 未增删生产映射，未覆盖全部CRUD |
| RproxyS sgn 定位 | 保持原Server portal和公网44457映射，仅将隧道经临时SSH localhost转送，TCP/UDP通过 | 原公网55500路径仍失败 |
| HAProxy | SO_MARK255原生TCP/TLS请求绕过Client嗅探，sam20961、sgn52096 HTTP200 | sam55443失败；历史backend UP/DOWN波动仍需留意 |
| DoH TLS | sam/sgn/LAX正确证书可解析，错误主机名无答案；测试CA有效leaf返回预定A，过期leaf无A、进程存活且日志识别过期；主代理独立复跑过期测试4 PASS | 不代表严格DNS接管或终端无泄露；未改变默认DNS分流策略 |

## 三条未通过链路

1. **sgn 默认 SOCKS5 出口 UDP 不通。** 四类入站TCP正常、UDP STUN超时。sgn本机直连多个STUN成功；独立Xray使用现用direct outbound通过，使用现用默认SOCKS5 outbound失败。上游UDP ASSOCIATE返回私网地址，但诊断性发送到上游公网地址仍失败。因此定位到现用SOCKS5出口链路，不能将私网返回值判为唯一根因，也未证明公网替换可修复。未改生产出口。
2. **sgn RproxyS 公网55500隧道路径异常。** 原路径公网44457映射reset；只将tunnel经临时SSH转送、保持协议/UUID/portal/映射不变后TCP/UDP通过。双方配置可以工作，仍需核对提供商55500映射及网络路径；未检查面板，不断言具体提供商错误。
3. **sam HAProxy55443上游异常。** 上游`sg.samue.qzz.io:55443`当前无法解析、转发TLS EOF；另外sam20961及sgn52096正常。未替换用户上游。

sgn公网业务入口`:55443`外部HTTPS/节点测试正常；共享NAT`:443`的其他证书不判为dex故障。sgn本机自访公网失败不能外推为外部不可用。

## 测试纠正与恢复

- 浏览器测试后删除临时节点，恢复原0conf；PHP保存仅格式化导致byte hash变化，已按保留属性方式恢复。最终0conf和runtime hash与前备份一致。
- 初版路由fixture未屏蔽NodeSM内部systemctl，误触一次生产SmartDNS重启（09:39:17 CST），未改生产配置；已在测试副本屏蔽systemctl，重跑15项通过，最终服务/DNS正常。
- 默认路由日志为`>> default`，指定分流为`-> tag`；初版断言只识别后者造成误报，修正测试后通过，未改业务路由。
- curl connect-to经Client嗅探会改变连接目标，初版HAProxy探测不作为失败依据；最终以标记绕过TProxy的原生socket/TLS请求为准。
- 临时Xray/HTTP/UDP echo/SSH转送均停止；sam/sgn临时Rproxy连接恢复零。过期证书测试CA/私钥随临时目录清理，不入仓库。

## 未覆盖项

- WireGuard peer生成、真实握手、IPv4-only出口及恢复；当前inactive，不擅自启用整机路由。
- 22/35/44/55所有菜单增删、冲突、失败回滚、多profile及重启持久性；主要覆盖现有配置数据面。
- NodeDT局域网源地址及预定义/自定义/黑白名单交叉优先级完整矩阵。
- 最新下载修改后的完整Server/Client全新安装及更新；sam本轮未重装。
- 严格DNS、终端接管及原始DNS泄露页面完整复测。

## 证据与复跑

本地/只读原始报告：`docs/full-acceptance-20261017-luna.md`。新增脚本：`tools/test-live-inbounds.py`、`tools/test-live-rproxy.py`、`tools/test-live-routing.py`、`tools/test-smartdns-expired.py`。前三者使用远端私有fixture，其中含认证信息，禁止提交或打印。远端目录`/root/dex-full-acceptance-20261017/`。

过期证书独立复跑：

```sh
ssh -i /Users/stuinx/.ssh/stuinxo -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile=/private/tmp/dex-vm1224-stage2-knownhosts root@10.0.0.224 python3 - < tools/test-smartdns-expired.py
```

Archive资源未变，SHA256仍为`f268e0ca9102369ccf95eb4440e4ef0e09cde011cbfe57150e6ac31ab53513fe`。当前不能作为“全部通过后发布”的放行；需先决定三条异常链路修复方向，再补齐缺口。
