# dex 改造交接（从原 de_GWD 做到当前状态）

这份文档的用途：只凭本文，从 **jacyl4/de_GWD @ a689d11（v1.26.5）** 改出当前 **dex `dev`**。不要对照聊天记录。现网主机只作验收附录，不是改造步骤。

**禁止：** 把 Cloudflare Key / SOCKS 密码写入仓库；向 `jacyl4/de_GWD` push；未经要求向 GitHub 推送（含 `stuinx/dex`）。

---

## 0. 起点与成品定义

### 起点

```
git clone https://github.com/jacyl4/de_GWD.git
git checkout a689d11
```

主程序：`server`、`client`，资源在 `resource/`。运行时目录仍叫 `/opt/de_GWD`（不要改路径名）。

### 成品判定（缺一不可）

1. 安装/更新 URL 全部指向 `https://github.com/stuinx/dex`（或 raw），`branch="dev"`，`version.php` 首行 `dev`。
2. Server 菜单 **55** 可加 REALITY / VLESS+WS+TLS / SOCKS5 / dokodemo，**不改** 主 VMess `inbounds[0]`。
3. VLESS WS 的 nginx 只写独立 `vless-ws.conf`，不注入 `default.conf`。
4. Server 菜单 **44** 多规则 HAProxy TCP 转发（`tcppf.json`）。
5. Server 菜单 **22** RproxyS：TCP 反向隧道；可单独增删 mapping；空 UUID 生成。
6. 证书：DNS-01 通配；≥3 标签发 `*.parent` + `*.host`；443 也走 DNS-01。
7. 菜单 22/44/55 做完留在本级，`[0] Back`；55 的 View 是 `[5]`。
8. 客户端 NodeSM 预定义分流为下文「全表」，无 Netflix/HBO/TVB/巴哈。
9. `tests/` 中 xray extras / tcppf / acmeWildcardNames 测试通过。
10. 改 UI 后重打 `resource/client/Archive.zip` 及其 sha256。

---

## 1. 仓库与安装器改名

把 `server`、`client`、`version.php`、`resource/client/ui-*`、文档里所有

`github.com/jacyl4/de_GWD` / `raw.githubusercontent.com/jacyl4/de_GWD`

改成 `stuinx/dex`。chnroute 仍用 `jacyl4/chnroute`（那是独立名单仓）。

`server` / `client` 顶部：

```
branch="dev"
```

资源 URL 用 `https://raw.githubusercontent.com/stuinx/dex/$branch/...`。

`version.php`：

```
dev
-
<?php
$urls = array(
  'https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/dev/version.php',
  ...
);
```

`NOTICE.md`：Modified Work of 寒月/de_GWD；起点 a689d11；本树 version `dev`。

安装命令（README）不要 `apt install -y wget`：

```
bash <(wget --no-check-certificate -qO- https://raw.githubusercontent.com/stuinx/dex/dev/server)
bash <(wget --no-check-certificate -qO- https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/dev/client)
```

在线 `bash <(wget server)` **不会**带上旁边的 `resource/server/rproxyS-save`。必须：`repoDL` 时下载到 `/opt/de_GWD/rproxyS-save`；`rproxySsave()` 本地没有则再 wget 同一文件。

Xray 目标稳定版 **v26.3.27**（打进 `de_GWD_*.zip`）。x25519 输出兼容：

- 旧：`Private key:` / `Public key:` 或 `Password:`
- 26.3+：`PrivateKey:` / `Password (PublicKey):`

解析用 awk `IGNORECASE` 匹配 `Private( key|Key)?` 与 `Public[[:space:]]*key|Password`。

---

## 2. 客户端安装可靠性（相对原版必须保留）

原版在国内/干净 Debian 上会断。至少做到：

| 点 | 要求 |
|---|---|
| GitHub 下载 | `gh_candidates`：`GH_PROXY` → ghfast.top → gh-proxy.com → 直连；`wget_gh` / `curl_gh` |
| 空 checksum | `checkSum` 缺文件或缺 hash 返回 `false`，禁止当成功 |
| 探测失败 | 公网探测失败不当成「节点挂了就停栈」 |
| Pi-hole | 镜像优先 `docker.1ms.run` / `docker.1panel.live`；`FTLCONF_misc_etc_dnsmasq_d=true`；等 `pihole.toml` 再写配置 |
| nftables | 独立 table；不 `flush ruleset`；等 `network-online.target`；用运行时网卡名做 flowtable |
| 权限 | `/tmp` 1777；`0conf` 0660 root:www-data；不要 sudoers 通配 NOPASSWD |
| 时间 | `tcpTime` 只用 chrony，禁止用 HTTP Date |
| UI 打包 | `cd resource/client && zip -rq Archive.zip ui-script ui-web` 再 `sha256sum` |
| 内核菜单 2 | 按源 URL 删残留 xanmod/liquorix（文件名不一定带 xanmod）。缺 `gpg`/`crontab` 先装。`apt update` 失败不得短路 `apt install`。XanMod 用 `archive.key` + 发行版代号，禁止 `releases` suite。 |

`tests/test_phase1.py` 覆盖上述若干项。`test_packaged_ui_matches_source` 要求 zip 内 `index.php` 等与源文件字节一致。

---

## 3. Server 55 Extra inbounds

### 3.1 数据

目录 `/opt/de_GWD/`（测试可 `DE_GWD_DATA_DIR`）：

- `extra-vlessws.json` `{enabled,domain,port,uuid,path}`
- `extra-reality.json` `{enabled,domain,port,uuid,flow,dest,serverName,privateKey,publicKey,shortId}`
- `extra-socks5.json` `{enabled,domain,port,user,password}`
- `extra-dokodemo.json` `{enabled,rules:[{port,target,targetPort,network}]}`

`extraJsonEnabled file`：文件存在且 `.enabled == true`。false **不占端口、不生成 inbound**。

**永远不要** `jq '{enabled:false}' file` 覆盖整个 JSON（会丢掉 uuid/path）。禁用用 `jq '.enabled=false'`。

### 3.2 合并 Xray：`extraInboundsAppend`

对 `/opt/de_GWD/vtrui/config.json`：

1. `inbounds |= map(select((.tag // "") | startswith("extra-") | not))` —— 只删 extra，**不重写 inbounds[0]**。
2. 按 enabled 追加：

| tag | 配置 |
|---|---|
| `extra-vless-ws` | listen `127.0.0.1:9891` vless ws `security:none` path 来自 JSON |
| `extra-vless-reality` | `0.0.0.0:<port>` vless tcp reality；clients.flow 可空；SOCKS 的 Xray 字段是 `accounts[].pass` |
| `extra-socks5` | `0.0.0.0:<port>` socks password + udp |
| `extra-dokodemo-N` | dokodemo-door 每条规则一个 inbound |

`XrayInbound` 重建主 VMess 后必须再调 `extraInboundsAppend`（原 `XrayInbound` 末尾加这一行）。

VLESS path 公式与主 VMess 相同：`/` + UUID 后 6 位；与主 path 冲突则重抽 UUID。

### 3.3 VLESS WS nginx

- `extraVlessWsNginxBlock()` **恒 return 0**（禁止注入 default.conf）。
- `extraVlessWsWriteNginx` 写 `/etc/nginx/conf.d/vless-ws.conf`：`upstream vlessws { 127.0.0.1:9891 }` + `server { listen $port quic/ssl; server_name $domain; include .ssl_certs; root /var/www/html（GET / 伪装主站，勿只留空 vhost）; location $path { websocket → vlessws; 否则 404 } }`。
- disable 时删该 conf。
- **同端口**与主 nginx `listen ... reuseport` 冲突，禁止。

`extraParseInstallAddr`：必须 `域名:端口`。无冒号或无端口 → 失败（**不要**默认 443）。

### 3.4 REALITY

Listen port **必填**。空 dest → `127.0.0.1:$(extraGetPort)`（nginx TLS 口，扫 `ssl .* reuseport`）。空 SNI → `extraGetDomain`。空 Vision → `y` → `xtls-rprx-vision`，`n` → flow 空。

### 3.5 端口占用 `tcppf_port_available`

占用则失败：nginx 当前 TLS 口、80、443、9890、9891、3000、8053、**enabled** extra 的 `.port` / `.rules[].port`、`tcppf.json` 的 `localPort`、0conf Rproxy 隧道与 mapping。

### 3.6 应用 `extraXrayApply`

备份 xray config + default.conf + vless-ws.conf → 写 nginx vless → `nginxWebConf` → `XrayInbound`（内含 append）→ `xray run -test` 与 `nginx -t` 失败则回滚。测试模式 `DE_GWD_TEST_MODE=1` 只改文件不 systemd。

### 3.7 菜单 55

循环直到 Back：

```
[1] REALITY  [2] VLESS WS  [3] SOCKS5  [4] dokodemo  [5] View  [0] Back
```

子菜单 Enable/Disable/`[0] Back`；dokodemo 本级循环 Add/Delete/Disable。完成后回到 55，不要直接回主菜单。SOCKS 端口/用户/密码必填。dokodemo 目标支持 `host:port` 与 `[ipv6]:port`；网络空回车 = `tcp,udp`，也可 `tcp` / `udp`。

`printNode`（菜单 11）：主节点 `vmess://...` **整串引号**交给 `qrencode`（`&` 不能被 shell 拆）。然后打印各 extra 的 vless/socks/dokodemo 行。

---

## 4. Server 44 HAProxy

文件 `/opt/de_GWD/tcppf.json`：

```json
{"rules":[{"localPort":20960,"upstream":"host:port"}]}
```

菜单循环：`[1] Add` `[2] Delete` `[0] Back`。Add 要 `host:port` + 本机端口；Delete 按本机端口或 `all`。frontend 名 `p<port>`，mode tcp，`bind :<port>`，`server endpoint host:port check resolvers local init-addr none`。`tcppf.json` 是真源；`printNode` / 菜单 44 若发现 HAProxy 仍是旧 `relay0` 或端口不一致，必须 `tcppf_sync_runtime` 写回，禁止只打印 JSON。

`parseDomainPort` 支持 `host:port` 与 `[ipv6]:port`。

---

## 5. Server 22 RproxyS

### 5.1 语义

原版可能带 WS/TLS 备路（`/rpws`）。当前：**只要 raw TCP VMess 隧道**。`rproxyS-save` 注释即 “wu/LA-style raw TCP tunnel only”，`streamSettings.network=tcp`，**不要** TLS 备路。

0conf：

```
FORWARD.Rproxy.server.tunnel.{port,uuid}
FORWARD.Rproxy.server.mapping = [{port, protocol:"tcp,udp"}, ...]
FORWARD.Rproxy.server.mappingStatus = on|off
FORWARD.Rproxy.server.inStatus = off   # 菜单已去掉 Extra UUID
```

`rproxyS-save`：复制 `vtrui` 为 `RproxyS` 二进制；写 reverse portal `reverse.localhost`；inbound `reverseTunnel` vmess 隧道口；每个 mapping 一个 dokodemo `127.0.0.1:<samePort>`，routing 到 `portal`。

### 5.2 菜单（不要整表重写 mapping）

```
[1] Status  [2] Tunnel  [3] Add mapping  [4] Delete mapping  [5] Stop  [0] Back
```

- Tunnel 口：无已有值则必填；有则空=沿用。禁止 80/443/55443。
- UUID：空=已有则沿用，否则 `cat /proc/sys/kernel/random/uuid`。
- Add mapping：一行 `22201` 或 `22201,22202` 或 `22203/tcp`；**立刻结束**（不要 `while read` 空行结束，否则像卡住）。合并 `unique_by(.port)`。
- Delete：端口列表或 `all`。空回车不当成成功。
- `rproxyS-apply` 会用默认 55444 **重写** 0conf，**禁止当 Status**。

`rproxySsave()`：找 `/opt/de_GWD/rproxyS-save`，或从 `resource/server/rproxyS-save` 拷，或 wget `.../stuinx/dex/$branch/resource/server/rproxyS-save`。

---

## 6. 证书 ACME

原版 `makeSSL_D` 用最后两标签：`sam.stuinx.eu.org` → 错成 `eu.org` / `*.eu.org`。443 用 HTTP-01 `makeSSL_W` 只签精确名。

改为函数 `acmeWildcardNames $domain`：

- 标签数 ≥ 3：`*.${domain#*.}` 与 `*.$domain`  
  例 `sam.stuinx.eu.org` → `*.stuinx.eu.org *.sam.stuinx.eu.org`
- 标签数 = 2：`$domain *.$domain`
- LE **拒绝** 同一张证同时含 `sam.stuinx.eu.org` 与 `*.stuinx.eu.org`（精确名已被通配覆盖）。`*.stuinx.eu.org` **能**匹配 `sam.stuinx.eu.org`。

`makeSSL_D` **与** `resource/client/ui-script/ui-installCER` 必须使用同一套 `acmeWildcardNames`（空域名 / 标签 < 2 返回失败）。禁止硬编码 `-d $domain -d *.$domain` 或 `-d $topDomain -d *.$topDomain`。`--issue --dns dns_cf -d "$n1" -d "$n2" -k ec-256 --dnssleep 180`，`--installcert -d "$n1"` 到 `/var/www/ssl/de_GWD.{key,cer}`。安装与换域名 **一律 DNS-01**（含 443），提示 CF Key + Email；**不要**把 Key 写进 git。不要在签发成功前清掉 `/root/.acme.sh` 或现网证书。改完 `ui-installCER` 后重打 `Archive.zip`。

测试：`tests/test_server_acme_names.sh`（函数输出）与 `tests/test_phase1.py` 的 `test_acme_issues_full_domain_not_last_two_labels`（server + 客户端脚本都不得再用旧 SAN）。

---

## 7. 菜单 UX 总则

- 22/44/55 及 dokodemo 子菜单：`while true` + `[0] Back`。
- 主菜单选 22/44/55 进入循环，Back 才回 `start_menu`。
- 少写说明句；不要发明未确认的默认端口。
- `printNode` 的 Link 与 `qrencode` 必须给完整引号 URL。

---

## 8. 客户端 NodeSM 预定义分流

原 NodeSM 行：YouTube、Netflix、HDH、TVB、巴哈、OpenAI、Apple、Steam。

**删除** Netflix / HBO+Disney+Hulu / TVB / 巴哈（UI + `ui-NodeSM` 逻辑）。每次保存再 `jq del` 0conf 里 `.netflix/.hdh/.tvb/.bahamut`，避免残留。

**保留** YouTube、OpenAI、Apple、Steam（行为与原版相同：Apple/Steam 默认直连）。

**按原「一行一类」增加**（不要合成「国外 AI」；Grok 与 X/推特分开）：

`ui-NodeSM` 参数顺序（`$1=r` 时 `$2` 起）：

| $n | 行 | 0conf key | tag | domain | ip |
|---|---|---|---|---|---|
| 2 | YouTube | youtube | nodeSMyoutube | geosite:youtube | |
| 3 | OpenAI | openai | nodeSMopenai | geosite:openai | |
| 4 | APPLE | apple | nodeSMapple | 原 apple 列表 | |
| 5 | Steam | steam | （原逻辑直连/代理） | steam@cn 等 | |
| 6 | Claude | claude | nodeSMclaude | geosite:anthropic, domain:claude.ai | |
| 7 | Gemini | gemini | nodeSMgemini | geosite:google-gemini + gemini.google.com, aistudio.google.com, generativelanguage.googleapis.com | |
| 8 | Grok | grok | nodeSMgrok | domain:x.ai, grok.com, grok.x.ai | |
| 9 | Wikipedia | wikipedia | nodeSMwikipedia | geosite:wikipedia, wikimedia | |
| 10 | Reddit | reddit | nodeSMreddit | geosite:reddit | |
| 11 | GitHub | github | nodeSMgithub | geosite:github | |
| 12 | Discord | discord | nodeSMdiscord | geosite:discord | |
| 13 | Telegram | telegram | nodeSMtelegram | geosite:telegram | geoip:telegram |
| 14 | X/推特 | twitter | nodeSMtwitter | geosite:twitter, domain:x.com | geoip:twitter |

新槽用函数 `nodeSMslot arg key tag routingDomain [routingIP]`，语义与原 YouTube 槽相同：非 0 选节点写 outbound+rule；`0` 删除该 key；空参数则从 0conf 恢复。开头 `jq del` 所有 `nodeSM*` extra outbound/rule。

`ui-NodeSMcheck` 按上表顺序每行输出两行：`index` 与 `name`（无则 `0` / `-none-`）。`index.php` 按该顺序解析，重置时新行回到「默认代理」，Apple/Steam 仍「直连」。

`act/NodeSMrules.php` exec：

```
ui-NodeSM r $youtube $openai $apple $steam $claude $gemini $grok $wikipedia $reddit $github $discord $telegram $twitter
```

名单数据源：客户端已有的 Loyalsoldier `geosite.dat`/`geoip.dat`。dat 无 tag 时只留 `domain:`。不要加 Copilot、Perplexity、国内 AI。不要用自定义 CU 文本框代替这些行。CU 规则须排在这些预定义之前。

改完 UI 后重打 `Archive.zip`。

---

## 9. 关键文件地图

| 文件 | 改什么 |
|---|---|
| `server` | URL/branch、ACME、55/44/22、printNode、rproxySsave wget |
| `client` | URL/branch、gh 代理、checksum、pihole/nft |
| `version.php` | 首行 `dev`，检查 URL 走 dex/dev |
| `resource/server/rproxyS-save` | 仅 TCP reverse |
| `resource/server/rproxyS-apply` | 写 0conf 后调 save；**会覆盖隧道** |
| `resource/client/ui-script/ui-installCER` | 与 server 同一套 `acmeWildcardNames`，禁止 `$domain *.$domain` |
| `resource/client/ui-script/ui-NodeSM` | 分流槽 |
| `resource/client/ui-script/ui-NodeSMcheck` | 回显 |
| `resource/client/ui-web/index.php` | NodeSM 弹窗 |
| `resource/client/ui-web/act/NodeSMrules.php` | GET → ui-NodeSM |
| `resource/client/Archive.zip` + `.sha256sum` | 与源同步 |
| `NOTICE.md` `README.md` | 署名与安装命令 |
| `tests/test_server_xray_protocols.sh` | extras 合并、mapping 解析、VLESS 必须带端口 |
| `tests/test_server_tcppf.sh` | 多规则 HAProxy |
| `tests/test_server_acme_names.sh` | 通配名字 |
| `tests/test_phase1.py` | 客户端可靠性；其中 ACME 旧断言可能与通配冲突，以 `acmeWildcardNames` 为准 |

---

## 10. 验收命令

仓库根：

```
bash tests/test_server_xray_protocols.sh
bash tests/test_server_tcppf.sh
bash tests/test_server_acme_names.sh
python3 tests/test_phase1.py
```

实机 Server：`bash /opt/de_GWD/server` → 55 加各协议（主 UUID/path 不变）→ 11 能复制 vmess/vless 链接 → 22 先 Tunnel 再多次 Add mapping。

实机 Client：更新后打开 NodeSM，应看到 YouTube/OpenAI/Claude/Gemini/Grok/Wikipedia/Reddit/GitHub/Discord/Telegram/X/Apple/Steam，无 Netflix/巴哈等。

---

## 附录 A. 本环境主机（非改造步骤）

密钥：`~/.ssh/stuinxo`，`IdentitiesOnly=yes`。

| 角色 | SSH |
|---|---|
| sam | `-p 11122 root@146.235.237.190` |
| LA | `root@la.124444.xyz` |
| 222 客户端 | `root@10.0.0.222` |
| SG | `-p 55522 root@sg.samue.qzz.io` |

交互 SSH 可能 60–120s 空闲断开；短命令 + ServerAlive。不要把机上密码写进文档仓库。

## 附录 B. 菜单默认值白名单

允许空输入的 **只有**：Rproxy UUID（生成/沿用）、REALITY dest/SNI/Vision（上文公式）、Tunnel 口在 **已有配置时** 沿用、dokodemo 网络（空 = `tcp,udp`）。其余必填。
