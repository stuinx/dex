# uGWD

独立维护的 Debian 旁路网关（基于寒月 / de_GWD 的修改版）。

* 具备流量整形加速的旁路网关
* 仅供学习与研究，不支持机场的双端自建方案
* 基于性能考量，尽量避免使用虚拟交换

本仓库协议为 [EPL-2.0](LICENSE.md)。来源与署名见 [NOTICE.md](NOTICE.md)。

安装、更新和 Release 只使用本仓库：https://github.com/stuinx/uGWD

## Server (amd64 & arm64) support kvm xen openvz lxc and so on:

```
apt install -y wget
bash <(wget --no-check-certificate -qO- https://raw.githubusercontent.com/stuinx/uGWD/main/server)
```

![uGWD 0](resource/screenshot/0.png)

## Client (amd64):

```
apt install -y wget
bash <(wget --no-check-certificate -qO- https://ghproxy.net/https://raw.githubusercontent.com/stuinx/uGWD/main/client)
```

或

手动上传 client 文件与 de_GWD 压缩包后

```
chmod +x client
./client
```

![uGWD 1](resource/screenshot/1.png)
![uGWD 2](resource/screenshot/2.png)
![uGWD 3](resource/screenshot/3.png)
![uGWD 4](resource/screenshot/4.png)
![uGWD 5](resource/screenshot/5.png)

## Manual

仓库文档：https://github.com/stuinx/uGWD

Release：https://github.com/stuinx/uGWD/releases

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
