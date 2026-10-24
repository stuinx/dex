<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$FWD0index = $_GET['FWD0index'];

$de_GWDconf = json_decode(file_get_contents('/opt/de_GWD/0conf'));
$serverDomain = $de_GWDconf->FORWARD->domain;
$FWD0port = $de_GWDconf->FORWARD->FWD0->port;
$FWD0uuid = $de_GWDconf->FORWARD->FWD0->uuid[$FWD0index-1]->FWD0uuid;
$FWD0path = rawurlencode('/' . substr($de_GWDconf->FORWARD->FWD0->uuid[0]->FWD0uuid, -6));

print("vless://$FWD0uuid@$serverDomain:$FWD0port?encryption=none&security=tls&type=ws&host=$serverDomain&sni=$serverDomain&path=$FWD0path#$serverDomain:$FWD0port");
?>
<?php }?>
