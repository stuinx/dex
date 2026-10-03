# 寒月
* 具备流量整形加速的旁路网关
* 仅供学习与研究，不支持机场的双端自建方案

* 基于性能考量，尽量避免使用虚拟交换


[![Telegram](https://cdn.jsdelivr.net/gh/Patrolavia/telegram-badge@8fe3382b3fd3a1c533ba270e608035a27e430c2e/chat.svg)](https://t.me/de_GWD_DQ)  


## Server (amd64 & arm64) support kvm xen openvz lxc and so on:
```
bash <(wget --no-check-certificate -qO- https://raw.githubusercontent.com/stuinx/dex/main/server)
```

![de_GWD 0](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/0.png)

## Client (amd64 & arm64):
```
bash <(wget --no-check-certificate -qO- https://gh.stuinx.eu.org/https://raw.githubusercontent.com/stuinx/dex/main/client)
```
或

手动上传client文件与de_GWD压缩包后
```
chmod +x client
./client
```

## Release source

dex 的安装入口和运行资源由本仓库维护。jacyl4/de_GWD 仅作为历史参考，不参与安装、更新或资源下载。

正式部署使用固定 tag，并将同一个 tag 传给安装脚本，避免 main 变化导致后续资源漂移：

    https://raw.githubusercontent.com/stuinx/dex/<tag>/server
    https://raw.githubusercontent.com/stuinx/dex/<tag>/client

安装时将 DE_GWD_BRANCH 和 DE_GWD_RAW_BASE 同时指向这个 tag：

    DE_GWD_TAG=vX.Y.Z
    DE_GWD_BRANCH="$DE_GWD_TAG" DE_GWD_RAW_BASE="https://raw.githubusercontent.com/stuinx/dex/$DE_GWD_TAG" bash <(wget --no-check-certificate -qO- "https://raw.githubusercontent.com/stuinx/dex/$DE_GWD_TAG/server")
    DE_GWD_BRANCH="$DE_GWD_TAG" DE_GWD_RAW_BASE="https://gh.stuinx.eu.org/https://raw.githubusercontent.com/stuinx/dex/$DE_GWD_TAG" bash <(wget --no-check-certificate -qO- "https://gh.stuinx.eu.org/https://raw.githubusercontent.com/stuinx/dex/$DE_GWD_TAG/client")

发布前应执行 `bash tools/check-self-owned-release-chain.sh`，确认安装入口、运行资源、归档和 SHA256 校验文件均由本仓库维护且彼此一致。

![de_GWD 1](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/1.png)
![de_GWD 2](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/2.png)
![de_GWD 3](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/3.png)
![de_GWD 4](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/4.png)
![de_GWD 5](https://raw.githubusercontent.com/stuinx/dex/main/resource/screenshot/5.png)

## Manual:
[Deepwiki 自动生成的文档](https://deepwiki.com/stuinx/dex)

## Thanks to
* [ XTLS/Xray-core ](https://github.com/XTLS/Xray-core)
* [ coredns/coredns ](https://github.com/coredns/coredns)
* [ pymumu/smartdns ](https://github.com/pymumu/smartdns)
* [ IrineSistiana/mosdns ](https://github.com/IrineSistiana/mosdns)
* [ m13253/dns-over-https ](https://github.com/m13253/dns-over-https)
* [ pi-hole/docker-pi-hole ](https://github.com/pi-hole/docker-pi-hole)
* [ mmotti/pihole-regex ](https://github.com/mmotti/pihole-regex)
* [ Loyalsoldier/v2ray-rules-dat ](https://github.com/Loyalsoldier/v2ray-rules-dat)
* [ makotom/cfspeed ](https://github.com/makotom/cfspeed)
* [ mzz2017/lkl-haproxy ](https://github.com/mzz2017/lkl-haproxy)
* [ zabbly/linux ](https://github.com/zabbly/linux)
* [ xanmod/linux ](https://github.com/xanmod/linux)
* [ tsl0922/ttyd ](https://github.com/tsl0922/ttyd)
* [ mikefarah/yq ](https://github.com/mikefarah/yq)
* [ nyanmisaka/jellyfin ](https://hub.docker.com/r/nyanmisaka/jellyfin)
* [ dani-garcia/vaultwarden ](https://github.com/dani-garcia/vaultwarden)

## Stargazers over time
[![Stargazers over time](https://starchart.cc/stuinx/dex.svg)](https://starchart.cc/stuinx/dex)

[![Powered by DartNode](https://dartnode.com/branding/DN-Open-Source-sm.png)](https://dartnode.com "Powered by DartNode - Free VPS for Open Source")
