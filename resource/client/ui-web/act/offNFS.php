<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$NFSpoint = gwdRequestString('NFSpoint');
if ($NFSpoint[0] !== '/' || strpos($NFSpoint, '\\') !== false) { http_response_code(400); exit('Invalid NFS mount path'); }
exec('sudo /opt/de_GWD/ui-NFSoff ' . escapeshellarg($NFSpoint) . ' &');
?>
<?php }?>