<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$WGnum = $_GET['WGnum'] ?? '';
passthru('sudo /opt/de_GWD/ui-webWGqr ' . escapeshellarg((string)$WGnum));
?>
<?php }?>
