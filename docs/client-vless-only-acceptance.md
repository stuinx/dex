# Client 普通节点 VLESS-only 验收（2026-10-13）

## 范围

用户确认仅移除普通节点及分流中的 VMess。FWD0/FWD1、RproxyC/RproxyS 内部隧道及 Server 55 VMess 保留；不新增权限修改，不提交或推送。

## 已验证

- vm1224：Debian 13，stock 6.12.111+deb13-amd64；完整更新退出码 0。
- 更新前加入两个未使用的测试节点（显式 VMess、缺少协议），并保存旧 Claude 分流引用；更新后均清理，仅留下原有 LAX VLESS 节点。
- 已安装 PHP 节点保存程序：VMess 拒绝且配置不变，VLESS 保存正常。PHP 语法通过。
- 全部 13 项预定义分流指定当前 VLESS 节点：出站数量 13、协议均为 VLESS、状态检查编号和地址正确，实际 Xray 配置校验通过。测试后恢复干净的更新后配置。
- HTTPS 返回 200；透明 TCP 和 UDP STUN 出口一致，均为 LAX 公网地址。
- smartdns、mosdns、vtrui、nftables、nginx、php7.4-fpm、docker、cron、chrony 均 active。
- 本地 Client 清理/PHP 保存/拒绝旧节点、NodeSM、Server 协议迁移与共存、Debian 源、SOCKS5 UDP/出口回归及资源链检查通过。
- Archive 已重打包并保留原 ZIP 条目权限；SHA256：`d1f11dcf83b67aa02255be4ed3adaf03e7994bc170bfe4ea370e3319c5b4fcfe`。

## 边界与现场问题

- 默认节点是 VMess 时要求先切换有效 VLESS，不把旧 UUID/PATH 静默改成 VLESS。
- 内部隧道脚本未修改；尚未重新启用真实内部隧道进行数据面测试。
- PHP 保存已做实际程序隔离测试，未宣称浏览器人工点击验收。
- 一次测试调用了不存在的 xray 文件名，随后使用服务实际核心 vtrui 重新校验通过；非项目失败。
- 第一次更新测试单元缺少测试运行器，修正测试环境后完整更新通过。
- vm1224 既有 Exim4 绑定禁用的 IPv6 地址失败，未扩展处理邮件服务。
- 重启复验通过：9 项业务服务 active、普通节点仍全部 VLESS、Xray 配置正常、透明 TCP/UDP 出口一致，本次重启后无失败单元。此前观察的 Exim4 问题未主动修复，不据此断言永久解决。临时资源服务已停止；未提交/推送。
