<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
$wanIP = exec('sudo /opt/de_GWD/ui-wanIP_cn');

if(filter_var($wanIP, FILTER_VALIDATE_IP)) echo $wanIP;
?>
