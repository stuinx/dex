<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
require_once __DIR__ . '/_request.php';
$pingTCP = gwdRequestIndex('pingTCP');
passthru('/opt/de_GWD/ui-pingTCP ' . escapeshellarg($pingTCP));
die();
?>
