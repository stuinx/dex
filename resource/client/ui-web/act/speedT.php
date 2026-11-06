<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
require_once __DIR__ . '/_request.php';
$speedT = gwdRequestIndex('speedT');
passthru('sudo /opt/de_GWD/ui-speedT ' . escapeshellarg($speedT));
?>
