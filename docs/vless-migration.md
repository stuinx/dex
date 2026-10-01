# VLESS 主节点迁移

此实现位于 `vless` 分支。Server/Client 安装入口、资源和 Client 自动更新默认使用此分支。

## 行为

- 全新 Server 默认创建 VLESS + WebSocket，TLS 由 Nginx 终止。
- 现有 Server 执行更新时，先迁移原 VMess 主入站为 VLESS。原 UUID 列表和 WS 路径保持不变，公网 TLS 域名和端口不变；不再保留 VMess compatibility 入口。
- 迁移后的主 VLESS 和全新安装的主节点都使用 `127.0.0.1:9890`。旧配置中的 `vmess` 兼容字段及 `vmess.conf` 会在成功应用配置时清理。
- 主节点按 `tag=main` 识别；旧配置无标签时才回退到第一个入站。
- `55 → 6. VMESS WS` 使用独立的 `vmess_ws` 字段。启用时填写域名和端口，自动生成 UUID 与 WS 路径；VMess WS 与 VLESS WS 均复用主线 `/var/www/ssl/de_GWD.cer` 和私钥，不单独申请证书。
- Client 安装可选择 `vless` 或 `vmess`，默认 VLESS；旧 `0conf` 缺少 `protocol` 字段时仍解释为 VMess。节点管理、节点切换、恢复主节点及共享出站生成器识别协议。
- 同地址的不同节点按 UUID、路径、协议区分。分流出站在 `v2nodeDIV.outboundNodes` 保存所选身份，供按地址重建时消除歧义。旧记录没有身份且同时匹配多条时需重新选择一次节点，不任意猜测。
- RproxyS 和 FWD 的独立 VMess 隧道不在此次协议迁移范围内。

## 迁移检查与恢复

自动迁移当前只接收项目标准的 `127.0.0.1:9890` VMess WS 主入站和带 `upstream xray`、`V2_START/V2_END` 标记的 Nginx 配置。不符合的自定义布局会停止迁移。

迁移前保留 `/opt/de_GWD/vless-backup.XXXXXX`，包含原 `config.json`、`default.conf`，以及原本存在的 `extra-inbounds.json`。自动迁移只修改 Nginx 的 Xray 后端与 WS 路由，保留原 TLS 配置。

应用时执行 Xray 配置检查、`nginx -t`、Nginx reload 和 Xray 重启检查。失败会恢复本次操作前的配置和服务状态。成功后保留上述备份供人工回退；重复更新不再次迁移、不改变现有身份。

若要人工回退，先核实对应备份和当前配置差异，再恢复这三个配置到原位置；迁移前没有 extra 配置时，需要移除本次新增的兼容设置。恢复后先执行 Xray 和 Nginx 配置检查，再重载服务。不要直接覆盖后来添加的其他入站。

## 验证

```sh
node tools/test-vless-migration.cjs
XRAY_BIN=/path/to/xray node tools/test-vless-loopback.cjs
bash tools/check-self-owned-release-chain.sh
```

第一项在临时目录测试实际脚本函数，服务操作和 Nginx 检查使用模拟实现；覆盖失败回滚、重复迁移、多 UUID 保留、入站重排序、VMess/VLESS WS 启停、全新默认协议、Client 协议持久化和同地址节点区分。

第二项同时使用真实 Xray 核心检查生成配置，并启动本地 Server/Client，通过 SOCKS 测试 VMess 和 VLESS 的 WS TCP、UDP。回环传输测试去掉 TLS 和 Linux socket mark，单独验证协议传输；不替代 Debian 上的 Nginx/TLS、透明 TProxy、重启及完整更新验收。

2026-09-26 本地使用 Xray 26.3.27 验证通过。尚未部署至 VPS，也未完成 Debian 现场验收。
