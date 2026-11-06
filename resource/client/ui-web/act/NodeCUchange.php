<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$nodeCUnum = gwdRequestIndex('nodeCUnum');
exec('sudo /opt/de_GWD/ui-NodeCU r ' . escapeshellarg($nodeCUnum));
?>
<?php }?>