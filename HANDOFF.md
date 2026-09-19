# Client TProxy 修复交接（2026-09-19）

## 范围与约束
在 dev 分支最小修复安装及透明代理；测试后推送，不修改权限。仓库实际位置为 /Users/stuinx/Documents/dex。

## 本次已验证
- vm1225 运行 Debian 6.1.0-52-amd64。上一轮安装已完成，本轮未再次恢复快照或重启 VM。
- 原配置本机 curl --noproxy '*' https://example.com 连接超时。
- 打开临时 debug 日志发现：failed to set TCP_FASTOPEN256 > protocol not available；9896 socket 缺少 transparent。
- 单独关闭 tcpMptcp 无效；tcpFastOpen=false 也无效。删除透明入站 tcpFastOpen 字段后 socket 显示 transparent，本机 HTTPS 返回 200。
- 修复 ui-NodeOne 并重新生成配置后，本机 api.ipify.org 出口为 154.9.249.75。
- PVE 临时单目标路由经 vm1225，TCP api.ipify.org 出口为 154.9.249.75。
- PVE 经 vm1225 的 UDP STUN 测试校验响应事务 ID，并解析 XOR-MAPPED-ADDRESS，出口为 154.9.249.75。
- 静态 bash -n、git diff --check、ZIP 完整性、包内 ui-NodeOne 与源文件比较和 SHA256 一致性通过。
- 无 failed unit，无残留 nft trace/test chain/network namespace；ip_nonlocal_bind 为 0。
- ui-NodeOne 修改前后为 755，config.json 为 644；未修改权限。

## 修改文件
- client：透明入站去掉 tcpFastOpen。
- resource/client/ui-script/ui-NodeOne：配置再生成时保持同一修复。
- resource/client/Archive.zip 与 Archive.zip.sha256sum：同步资源。

## 纠正先前结论
先前 LAN HTTP 200 和 STUN 成功未校验代理出口，不足以证明 TProxy 接管；此次以上述出口校验替代该结论。不要再将先前测试作为透明代理通过的依据。

## 未完成与下一步
- 本轮未做全新安装重跑、重启恢复或 Zabbly A/B；不得将这些报告为已通过。
- 如继续全新安装测试，固定当前 commit 与资源包，复核 stock/Zabbly 两端出口和 socket transparent。
- APT 重复源警告仍待处理，不在此次两行修复范围。
- 最终提交及远端状态请用 git status、git log、git ls-remote 实时核验。

## 恢复提示
vm1225 的原 ui-NodeOne 备份在 /tmp/degwd-NodeOne-before；临时测试配置已恢复或被修复脚本重新生成。不要输出完整代理配置或凭证。
