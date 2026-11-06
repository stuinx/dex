# sam 与 vm1225 验证（2026-11-06）


## 最终验收：通过，实现已正常推送

后续核验已解决下方历史阻塞。sam、vm1225各17套Node检查（含真实Xray回环）、PHP节点/FWD保存、下载/DoH及资源包检查最终通过；真实nft各34项通过。初次失败与修正保留在后文，不能把早期失败日志当作最终状态。

- HNN正确SSH端口为33332，33322是前序口述误差。Termius已登录会话核验hinat.nano的主机指纹，经LAX中继取得相同指纹后登录；没有关闭主机校验、没有修改authorized_keys。用户提供的口令不写入文件、报告或仓库。
- 真正根因：HNN的VLESS主入口为32087，32096为VMess WS额外入口。vm1225把旧32096节点按VLESS使用，其UUID/path也不匹配VLESS主入口。LAX32096原样转发HNN32096，转发本身不是故障。
- LAX新增独立、脚本可管理的32087→HNN32087 TCP转发，原32096配置逐字节保留。HAProxy原生校验、reload及两个监听通过；备份位于/root/dex-hnn-vless-fix-20261106-ymzmcqbn/haproxy.cfg.before。
- 新HNN VLESS参数先在vm1225独立core验证HTTPS200+UDP/STUN通过，再发布到当前所选节点；更新1个节点和2个runtime outbound引用，并同步其持久分流地址/身份。其余节点和规则保留。
- 两次早期透明探针未通过，均自动回滚。随后通过短时日志证明透明请求进入default新出站；等待监听就绪后复测，连续HTTPS200两次和UDP/STUN通过。最终恢复原5秒连接门限的curl再次HTTPS200（总时长7.158s，包含响应阶段）；百度HTTPS200（0.193s），透明UDP/STUN再次通过。
- 最终vm1225仅0conf与vtrui/config.json内容改变，两份文件mode/uid/gid保持；其余基线文件不变。七服务active，无失败单元；仅vtrui发生本次必要的配置重启。临时日志配置已恢复。
- 两份原配置回滚备份保留在/root/dex-dev-validation-20261106-arn7w44z/proxy-diagnosis/{0conf.before-fix,config.json.before-fix}，父目录0700。其他含实际身份的候选/探针文件已精确清理，本机候选文件亦删除。
- sam生产配置与七服务状态/启动时间保持本轮基线；HNN只读，无生产修改。没有执行完整安装升级或主机重启，Client Web仅真实PHP CLI fixture，不能宣称已完成完整浏览器/FPM与重启验收。
- 代码与验收资料已作为`bb90d40`提交，并从`1300776`普通快进推送到origin/dev；不强推、不修改main、不创建Release。

用户授权：sam 验证后推送；追加 vm1225 Client 验收；发现透明代理异常后，明确要求先定位修复、复测再推送。实现提交`bb90d40`已正常推送；下方进行中与阻塞段落为历史过程，最终状态以上述验收记录为准。

## 已验证

- sam 为 Debian 13，vm1225/10.0.0.225/client3 为 Debian 12。两台各七项生产服务 active，无失败单元。
- 当前源码上传1792文件并逐项核对SHA256。两台执行源码回归、PHP节点/FWD保存、下载/DoH、客户端Archive逐文件检查；初版环境/封装失败均已复测解决，见下文。
- 两台真实Xray 26.3.27：配置生成解析、VMess/VLESS WebSocket TCP与UDP localhost双端通过。
- 两台各34项真实nft测试通过；全部在独立network namespace，未操作宿主防火墙。
- vm1225作为独立外部Client连接sam：主VLESS、额外VLESS、REALITY、SOCKS5均HTTPS200、UDP/STUN通过。sam同机对上述入口也通过。
- sam实际旧RproxyS的私密副本：空clients窄迁移、原始备份、身份/映射保持、真实Xray配置校验通过；生产设置未修改。
- sam17份、vm1225 18份生产文件哈希/权限/属主前后相同；七项服务状态、MainPID、启动时间前后相同，均无失败单元。检查时尚未开始修复透明代理。

## 测试中发现并解决

- 三个fixture的路径二次替换在Linux /tmp下失败；已改为单次映射，本地 /tmp 和两台回归通过。
- 回环测试server fixture没有freedom outbound，原生配置解析通过但请求空响应；已为回环fixture明确配置freedom，并限定127.0.0.1监听，两台TCP/UDP均通过。
- sam缺Node/PHP/zip/geosite；均置于专用测试目录，Node官方SHA256验证，PHP/zip使用独立APT列表下载解包，没有apt install或更改系统源。vm1225使用现有PHP7.4；其JSON是共享扩展，临时driver不应使用-n，否则测试环境缺JSON。修正后Web及FWD回归通过。
- sam geosite资产放测试目录供原生SOCKS校验；未写生产路径。

## 当前异常与下一步

vm1225现有默认透明代理 curl -4 https://example.com 在SSL阶段超时；国内百度HTTPS200。当前默认为VLESS/WS/TLS，上游TCP及TLS证书验证通过；尚未替换生产脚本或配置。vm1225→sam独立客户端数据面正常。用户要求先修此异常，复测后再推送，不能绕过。

正在运行只读分层诊断：独立SOCKS复用当前默认outbound，与现有TProxy比较，再核对路由及接管。单条失败复现为 curl -4 --noproxy '*' --connect-timeout 5 --max-time 15 https://example.com。

## 恢复入口与边界

- 本机私密任务目录：/private/tmp/dex-validation-payload-dzyanv5x/；诊断脚本diagnose-client.py，源码包source.tar.gz与manifest.json，测试driver run-checks.py。
- sam：/root/dex-dev-validation-20261106-yw41kgrx/；SSH沿用可信host key，root，11122，既有Documents/stuinxo密钥。禁止打印或复制私钥。
- vm1225：/root/dex-dev-validation-20261106-arn7w44z/；root，默认22，既有~/.ssh/stuinxo密钥。
- 远端baseline.json、checks.json、check-*.log、final-sanitized.json为测试证据；checks.json保留早期失败，后续针对性复测输出已通过，最终报告需区分。
- 两台真实nft脚本：dex-nft-netns-verify-squ2uuck.py，SHA256 23ee67adcef8e3d4e8478953ee6362863f2a61bc6f6f55c2e71b0282116d63b1。
- 已清理sam/private实际配置副本、两端sam-live.json及本机sam-live.json；诊断脚本新建vm1225/proxy-diagnosis含当前默认节点私密配置，结束后须精确清理。
- 未执行完整安装/更新、OS升级或主机重启。sam上的Client Web仅CLI fixture，不代表真实FPM/浏览器验收；实际FastCGI HTTPS/SCRIPT_NAME参数已只读核对。
- 新增业务修复为server空clients legacy Rproxy窄迁移；未知非空clients或runtime不匹配仍拒绝、不改原文件。更新源文档旧legacy待办状态时应说明此窄范围。

## 透明代理定位更新：等待 HNN 可信管理入口

- 独立SOCKS复用当前默认outbound同样SSL超时，排除仅TProxy接管导致；当前WebSocket Upgrade为HTTP404。
- 现有节点实际是LAX HAProxy `:32096` → `hnn.124444.xyz:32096`，SNI/WS Host均HNN；三条HNN配置身份相同，未找到有效替代参数。
- 曾将转发入口误当LAX主入站，与LAX主VLESS的2096端口及身份比较；该比较不能证明HNN节点错误来源。已纠正，不得把LAX主入站参数写入HNN节点。对LAX候选的隔离请求失败，生产配置未替换。
- 修复候选完整core检查第一次因临时文件扩展名`.candidate`无法识别格式而拒绝，未进入发布/重启代码。此为封装问题，不是业务配置回归；今后临时配置必须以.json结尾或显式-format json。
- LAX已通过既有可信SSH的22端口只读核实，hostname US4837A。LAX的11122拒绝连接；无远端修改。
- HNN的22端口提示本机没有可信RSA主机密钥，严格校验拒绝；没有关闭校验、没有添加未知key。已向用户请求HNN正确SSH地址/端口/可信主机指纹或已有可信管理入口，等待答复。vm1224的旧host key也不匹配，未继续连接或更改known_hosts。
- 推送条件仍未满足：先读取真正HNN入站确认端口/UUID/path，做隔离原生TCP/UDP验证，备份后仅改匹配节点及引用；若失败须回滚。当前尚未提交/推送，未修改生产配置或重启vtrui。
- vm1225私密目录proxy-diagnosis里有原配置备份、失败候选和诊断配置，后续按精确文件路径清理；不得发布其中内容。本机lax-candidate.json亦含凭证，应删除，之后从正确HNN重新获取。

## HNN 入口补充（用户提供33322）

- 用户补充SSH端口33322。对hnn.124444.xyz:33322两次严格校验连接，均在SSH握手前关闭，尚未进行主机密钥或用户认证。
- 本机TCP探测未读到SSH banner；从LAX连接33322返回ConnectionRefusedError。当前地址解析到36.231.154.117。
- 本机known_hosts不存在该域名或当前IP的33322可信条目，但此次阻塞更早，属于无法建立SSH会话，不能仅靠放宽host key校验解决。
- 已再次请求用户确认HNN管理地址是否另有域名/IP，等待完整可信入口；不扫描其它端口、不猜测其他已保存主机的身份。生产仍未修改、尚未推送。

发布后清理：用于HNN验证的临时SSH控制会话已关闭；本机及远端候选身份/探针数据已清理，vm1225两份原配置备份与LAX原HAProxy配置备份保留供回滚。
