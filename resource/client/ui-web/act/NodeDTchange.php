<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$nodeDTnum = gwdRequestIndex('nodeDTnum');
exec('sudo /opt/de_GWD/ui-NodeDT r ' . escapeshellarg($nodeDTnum));
?>
<?php }?>