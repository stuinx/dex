<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$updateAddr = gwdRequestString('updateAddr');
$updatePort = gwdRequestIndex('updatePort', 1, 65535);
$updateCMD = gwdRequestString('updateCMD');
if (filter_var($updateAddr, FILTER_VALIDATE_IP) === false && filter_var($updateAddr, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) { http_response_code(400); exit('Invalid update address'); }

$conf = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
if (!is_array($conf) || json_last_error() !== JSON_ERROR_NONE) { http_response_code(500); exit('Update configuration is unreadable or invalid'); }
$conf['update']['updateAddr'] = $updateAddr;
$conf['update']['updatePort'] = $updatePort;
$conf['update']['updateCMD'] = $updateCMD;
$newJsonString = json_encode($conf, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($newJsonString === false || file_put_contents('/opt/de_GWD/0conf', $newJsonString, LOCK_EX) !== strlen($newJsonString)) { http_response_code(500); exit('Unable to save update configuration'); }


exec('sudo /opt/de_GWD/ui-updateSave 2>&1', $output, $status);
if ($status !== 0) {
    http_response_code(500);
    exit('Unable to prepare update; check the update URL and retry');
}

if(filter_var($updateAddr, FILTER_VALIDATE_IP)) {
} else {
$updateAddr = gethostbyname($updateAddr);
}

echo "$updateAddr:$updatePort";
?>
<?php }?>