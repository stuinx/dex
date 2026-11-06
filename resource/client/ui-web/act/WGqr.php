<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$WGnum = gwdRequestIndex('WGnum', 1);
passthru('sudo cat ' . escapeshellarg('/etc/wireguard/client' . $WGnum . '.conf'));
?>
<?php }?>