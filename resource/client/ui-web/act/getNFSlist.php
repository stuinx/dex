<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$NFSserver = $_GET['NFSserver'] ?? '';
passthru('sudo /opt/de_GWD/ui-webShowmount ' . escapeshellarg((string)$NFSserver));
?>
<?php }?>
