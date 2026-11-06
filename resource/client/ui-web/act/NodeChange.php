<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$nodenum = gwdRequestIndex('nodenum');
exec('sudo /opt/de_GWD/ui-NodeChange ' . escapeshellarg($nodenum) . ' &');
?>
<?php }?>