# dex 交接文档

日期：2026-09-09。独立维护仓库 **dex**（基于 de_GWD），GitHub `stuinx/dex`，本地 `/Users/stuinx/Documents/de`。

当前发布面是 **`dev` 分支**，版本号字符串 **`dev`**。`main` 仍是 `v1.26.7`，本轮不要合进去，也不要推 `jacyl4/de_GWD`。

---

## 仓库与发布

| 项 | 值 |
|---|---|
| 本地 | `/Users/stuinx/Documents/de`，分支 `dev` |
| 远程 `dex` | `https://github.com/stuinx/dex.git` |
| 远程 `origin` | `https://github.com/jacyl4/de_GWD.git`（只读对照，禁止 push） |
| 安装器 `branch=` | `server` / `client` 均为 `dev` |
| `version.php` 首行 | `dev`（UI 检查也指向 `dev`） |

本地 git 历史与 GitHub 不是同一条祖先。往 GitHub 推 `dev` 用 **worktree 叠在 `dex/dev` 上再 `git push dex HEAD:dev`**，不要 `git push --force` 本地 `dev` 到 GitHub（浅克隆缺对象会失败）。不要动 `dex/main`。

客户端 UI 改完必须重打 `resource/client/Archive.zip` 并更新 `Archive.zip.sha256sum`，否则安装仍是旧界面。

### 在线安装（测试）

Server：

```
bash <(wget --no-check-certificate -qO- https://raw.githubusercontent.com/stuinx/dex/dev/server)
```

Client：

```
bash <(wget --no-check-certificate -qO- https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/dev/client)
```

不要带 `apt install -y wget`。已装机器更新同样拉上述脚本。自动更新会跟 `dev`，不要让测试机去追 `main`。

---

## SSH / 主机

密钥一律 `-i ~/.ssh/stuinxo -o IdentitiesOnly=yes`。

| 角色 | 连接 | 备注 |
|---|---|---|
| sam（server） | `ssh -p 11122 root@146.235.237.190`（`sam.stuinx.eu.org`） | 交互 SSH 易约 60s 掉线；短命令 + `ServerAliveInterval` |
| LA / lax（server） | `ssh root@la.124444.xyz`（`154.9.249.75`） | 空闲约 120s 会断；已加 sshd `ClientAliveInterval 30` |
| 客户端 222 | `ssh root@10.0.0.222` | 正式节点仍指向 SG，测 sam/LA 用隔离临时 xray |
| SG（server） | `ssh -p 55522 root@sg.samue.qzz.io` | 主生产节点之一 |

LA 从台湾 `36.231.163.222` 密码登录会每 2 分钟重连，属链路空闲掐 TCP，不是内核重启。

---

## Server 菜单约定

22 / 44 / 55：**做完留在本级**，`[0] Back` 回上级。55 的 View 是 **`[5]`**。

未明确指定的端口/账号 **不要猜默认值**（不要 8443/1080/55444）。例外（已确认）：

- RproxyS 隧道 UUID：空 = 已有则沿用，否则生成
- REALITY dest：空 = `127.0.0.1:<nginx TLS 端口>`
- REALITY SNI：空 = 证书域名
- REALITY Vision：空 = `y`
- VLESS WS：必须 `域名:端口`，无端口不默认 443
- SOCKS5 / dokodemo 网络：必填

### 22 RproxyS

```
[1] Status
[2] Tunnel
[3] Add mapping
[4] Delete mapping
[5] Stop
[0] Back
```

映射可增删，不要整表重写。在线安装曾缺 `/opt/de_GWD/rproxyS-save`，现会从 GitHub `dev` 拉取。`rproxyS-apply` **不要当 status 用**，它会按默认端口重写隧道。

### 55 Extra inbounds

主 VMess（`127.0.0.1:9890` + nginx WS/TLS）不改。JSON：`/opt/de_GWD/extra-*.json`，由 `extraInboundsAppend` 合并，tag `extra-*`。

| 项 | 要点 |
|---|---|
| REALITY | 公网端口；Xray 直接听；11 打 `vless://`（pbk/sid/sni/flow） |
| VLESS WS TLS | nginx 独立 `/etc/nginx/conf.d/vless-ws.conf`；Xray `127.0.0.1:9891` `security none` |
| SOCKS5 | 端口/用户/密码必填，UDP |
| dokodemo | 可多规则；网络必填 |

端口占用检查：`tcppf_port_available`（nginx、80/443/9890/9891、已启用 extra、Rproxy、HAProxy）。`enabled:false` 的 extra JSON 不占端口。

细节：`docs/server-menu-55.md`（其中「VLESS 可不写端口默认 443」已过时，以代码为准）。

### 证书

`acmeWildcardNames`：≥3 标签发 `*.parent` + `*.host`（例：`sam.stuinx.eu.org` → `*.stuinx.eu.org` + `*.sam.stuinx.eu.org`）。通配必须 DNS-01。443 安装/换域名也走 CF + `makeSSL_D`，不再走 HTTP-01 `makeSSL_W`。

Let’s Encrypt **同一张证不能**同时有精确名 `sam.stuinx.eu.org` 和 `*.stuinx.eu.org`（已被通配覆盖）。`*.stuinx.eu.org` **可以**匹配 `sam.stuinx.eu.org`。

**不要把 Cloudflare Global API Key 写入仓库。**

### Xray

仓库目标稳定版 **v26.3.27**。部分现网仍是 **25.5.16**。x25519 解析要兼容 `PrivateKey:` / `Password (PublicKey):`。

---

## 客户端预定义分流（NodeSM）

首页弹窗，一行一类，选「默认代理」或某个 v2node。实现：`ui-NodeSM`、`ui-NodeSMcheck`、`ui-web/index.php`、`act/NodeSMrules.php`。名单用 Loyalsoldier `geosite.dat` / `geoip.dat`。

已删：Netflix、HBO/Disney+/Hulu、TVB、巴哈。写入规则时会清 `0conf` 里这四项残留。

| 行 | 默认 | 名单 |
|---|---|---|
| YouTube | 默认代理 | `geosite:youtube` |
| OpenAI | 默认代理 | `geosite:openai` |
| Claude | 默认代理 | `geosite:anthropic` `domain:claude.ai` |
| Gemini | 默认代理 | `geosite:google-gemini` `domain:gemini.google.com` `domain:aistudio.google.com` `domain:generativelanguage.googleapis.com` |
| Grok | 默认代理 | `domain:x.ai` `domain:grok.com` `domain:grok.x.ai` |
| Wikipedia | 默认代理 | `geosite:wikipedia` `geosite:wikimedia` |
| Reddit | 默认代理 | `geosite:reddit` |
| GitHub | 默认代理 | `geosite:github` |
| Discord | 默认代理 | `geosite:discord` |
| Telegram | 默认代理 | `geosite:telegram` `geoip:telegram` |
| X / 推特 | 默认代理 | `geosite:twitter` `geoip:twitter` `domain:x.com` |
| APPLE | 直连 | `geosite:apple` `geosite:apple-ads` `geosite:apple-dev` `geosite:apple-update` `geosite:icloud` `geosite:apple@cn` `geosite:apple-cn` |
| Steam 等国区游戏 | 直连 | `domain:steamserver.net` `geosite:steam@cn` `geosite:category-games@cn` |

Grok 与 X/推特 **分开**（Grok 常要美国 IP，推特 SG 即可）。不要并成「国外 AI」大类。不要把 Copilot/Perplexity/国内 AI 加进去。

自定义分流（CU）仍是独立文本框，与 NodeSM 并行；规则顺序上 CU 应优先于这些预定义行。

---

## 现网快照（2026-09-09，会变）

**sam** `sam.stuinx.eu.org` / `146.235.237.190`

- 证书 SAN：`*.stuinx.eu.org` + `*.sam.stuinx.eu.org`
- 主 VMess：`:443` UUID `da38c799-84ac-4d6b-8855-a6995a61b3bc` path `/61b3bc`
- RproxyS：隧道 `22000` UUID `85911e05-1da6-4caf-ae86-ab09d9261b29` 映射 `52442`、`22003`（曾误 `rproxyS-apply` 成 55444，已按 `RproxyS/settings.json` 恢复）
- 无仓库密钥。apex `stuinx.eu.org` 仍指向别的 IP。

**LA** `la.124444.xyz:2096`

- 主 VMess UUID `bfe8a4fd-b132-4959-9cfd-cb434ab382be` path `/b382be` DoH `/dq`
- VLESS WS `:2053` UUID `abd9eac0-a2bf-4a2e-847f-eee41cb21745` path `/b21745`（以机器 `printNode` 为准）
- REALITY 曾用 `:2087` / `:8443`（以现网 `extra-reality.json` 为准）
- SOCKS5 `:2054` 用户 `vinx`（密码在机上，勿写入 git）
- dokodemo `22500` → `hnn.124444.xyz:32096`
- RproxyS 隧道 `22200` UUID `e967069a-930f-47bb-b17f-44aa6667b875`；映射以现网为准（曾只留下 `22202`，`22201` 可能需再 Add）

**222** 正式 `v2node` 仍是 `sg.samue.qzz.io:55443`。双端测其他机用临时 xray，不要改 `0conf`。

---

## 测试

在仓库根：

```
bash tests/test_server_xray_protocols.sh
bash tests/test_server_tcppf.sh
bash tests/test_server_acme_names.sh
python3 tests/test_phase1.py
```

`test_phase1.py` 里 `test_acme_issues_full_domain_not_last_two_labels` 可能仍按旧 HTTP-01/`-d $domain -d *.$domain` 断言，与当前 DNS-01 通配逻辑不一致，修测试或忽略时先看 `acmeWildcardNames`。

客户端 UI 改动后跑 `test_packaged_ui_matches_source`（zip 必须与源文件一致）。

---

## 约束与坑

1. 只测自建；本地可改；`Documents/de` 有文件改动必须 git commit，且不要把无关家目录文件塞进去。
2. 不要把 CF Key、SOCKS 密码写进仓库或提交说明。
3. 不要 `rproxyS-apply` 当查询；会重写隧道。
4. 同端口 VLESS 与主 nginx 会 `duplicate listen`。
5. GitHub `dev` 与本地 `dev` 提交哈希可以不同（叠树推送），以 **树内容** 和 `dex/dev` 远端为准。

---

## 建议下一手

1. 客户端从 `dev` 重装/更新，打开 NodeSM 核对新行，Grok 选美国节点、其余可默认。
2. 把 `docs/server-menu-55.md` 里「可不写端口默认 443」改成与代码一致。
3. 修或删 `test_phase1` 那条过时 ACME 断言。
4. 需要正式版时再把 `branch` / `version.php` 改回 `main` 并打 release，本轮不要做。
