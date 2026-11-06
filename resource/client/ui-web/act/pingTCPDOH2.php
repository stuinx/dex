<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
passthru('/opt/de_GWD/ui-pingTCPDOH2');
die();
?>
