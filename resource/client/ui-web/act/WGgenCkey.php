<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$WGnum = gwdRequestIndex('WGnum');
$conf = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);

$WGSkey = $conf['wireguard']['server']['sprivatekey'];

if (empty($WGSkey) === true || $WGSkey == null) exec("sudo /opt/de_GWD/ui-WGgenSkey");

passthru('sudo /opt/de_GWD/ui-WGgenCkey ' . escapeshellarg($WGnum));
?>
<?php }?>