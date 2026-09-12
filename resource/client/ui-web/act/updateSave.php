<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$updateAddr = $_GET['updateAddr'] ?? '';
$updatePort = $_GET['updatePort'] ?? '';
$updateCMD = $_GET['updateCMD'] ?? '';

if (!preg_match('/^[1-9][0-9]{0,4}$/', (string)$updatePort) || (int)$updatePort > 65535 || strpos($updateCMD, 'https://') === false) {
http_response_code(400);
exit;
}

$conf = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$conf['update']['updateAddr'] = $updateAddr;
$conf['update']['updatePort'] = $updatePort;
$conf['update']['updateCMD'] = $updateCMD;
$newJsonString = json_encode($conf, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents('/opt/de_GWD/0conf', $newJsonString);


exec("sudo /opt/de_GWD/ui-updateSave &");

if(filter_var($updateAddr, FILTER_VALIDATE_IP)) {
} else {
$updateAddr = gethostbyname($updateAddr);
}

echo "$updateAddr:$updatePort";
?>
<?php }?>
