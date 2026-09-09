# Server 菜单 55 Extra inbounds 操作流程

主 VMess（`inbounds[0]`，默认 `127.0.0.1:9890` + nginx TLS/WS）不改。本菜单只追加 `extra-*` inbound。

进入：`bash /opt/de_GWD/server`（或重新下载 `server`）→ **55**。`[5]` 查看，`[0]` 返回。启用后也可回主菜单 **11** 打印分享链接。

端口不要占用：nginx 监听口、`80`、`443`、`9890`、`9891`、`3000`、`8053`、RproxyS 隧道/映射、HAProxy 转发口。

## 2. VLESS + WS + TLS（像安装 server 一样填域名+端口）

1. 55 → `[2]` → `[1]` Enable。
2. 与安装 server 相同：提示 `Input VPS domain`，填写 `域名` 或 `域名:端口`（不写端口则为 443）。**可以同域名**，端口不能与主 VMess 的 nginx 监听口相同（同端口会和 `reuseport` 冲突）。
3. UUID/path 仍按主 VMess 规则自动生成：新 UUID，`path=/` + UUID 后 6 位；与主 path 冲突则重抽。无需手填。
4. nginx **单独**写入 `/etc/nginx/conf.d/vless-ws.conf`（`upstream vlessws` + 独立 `server`）。主站 `default.conf` 不加 VLESS location。同一套证书（`.ssl_certs`）。非 websocket 返回 404。
5. Xray 只听 `127.0.0.1:9891`，`security: none`（TLS 由 nginx 终结）。
6. 菜单 11 取填写的域名:端口 和 `vless://`。客户端 SNI/Host 用填写的域名。
7. 关闭：55 → `[2]` → `[2]` Disable，删除 `vless-ws.conf`。主 VMess path/UUID 不变。

## 1. VLESS + REALITY（raw，可选 Vision）

1. 55 → `[1]` → `[1]` Enable。
2. Listen port、dest、SNI、Vision 均需填写，无默认值。
3. Vision 填 `y` 为 `xtls-rprx-vision`，填 `n` 则无 flow。
4. 私钥/公钥/shortId 自动生成。菜单 11 取 `vless://`（含 pbk、sid、sni、flow）。
5. 关闭：55 → `[1]` → `[2]` Disable。

## 3. SOCKS5

1. 55 → `[3]` → `[1]` Enable。
2. 端口、用户、密码均需填写。UDP 开启。
3. 菜单 11 取 `socks5://user:pass@host:port`。
4. 关闭：55 → `[3]` → `[2]` Disable。

## 4. dokodemo 多规则 TCP/UDP

1. 55 → `[4]` → `[1]` 添加：Listen port、目标 `host:port`、网络（`tcp` / `udp` / `tcp,udp`）均需填写。
2. 删除一条：`[2]` 后输入该 listen port；输入 `all` 或选 `[3]` 关闭全部。
3. 菜单 11 打印 `host:listen -> target:port network`。

## 验证

- 主节点 UUID/path 与启用前一致。
- `vtrui run -test -confdir /opt/de_GWD/vtrui` 与 `nginx -t` 通过。
- 配置校验失败会回滚 Xray/nginx，不留下半套 extra。
- VLESS WS：对该 path 普通 HTTPS 应为 404；带 `Upgrade: websocket` 才进 Xray。
