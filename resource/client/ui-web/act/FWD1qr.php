<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$FWD1index = $_GET['FWD1index'];

$de_GWDconf = json_decode(file_get_contents('/opt/de_GWD/0conf'));
$serverDomain = $de_GWDconf->FORWARD->domain;
$FWD1port = $de_GWDconf->FORWARD->FWD1->port;
$FWD1uuid = $de_GWDconf->FORWARD->FWD1->uuid[$FWD1index-1]->FWD1uuid;
$FWD1path = rawurlencode('/' . substr($de_GWDconf->FORWARD->FWD1->uuid[0]->FWD1uuid, -6));

print("vless://$FWD1uuid@$serverDomain:$FWD1port?encryption=none&security=tls&type=ws&host=$serverDomain&sni=$serverDomain&path=$FWD1path#$serverDomain:$FWD1port");
?>
<?php }?>
