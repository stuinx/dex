<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$NFSserver = gwdRequestString('NFSserver');

if (filter_var($NFSserver, FILTER_VALIDATE_IP) === false && filter_var($NFSserver, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) { http_response_code(400); exit('Invalid NFS server'); }
passthru('sudo showmount -e ' . escapeshellarg($NFSserver) . " | sed '1d'");
?>
<?php }?>