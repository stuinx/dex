<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$FWD0port = $_GET['FWD0port'];
$FWD0uuidList = $_GET['FWD0uuidList'];
if (!is_string($FWD0port) || !preg_match('/^[0-9]{1,5}$/D', $FWD0port) || (int)$FWD0port < 1 || (int)$FWD0port > 65535) {
    http_response_code(400);
    exit('FWD0 port must be between 1 and 65535');
}

if (!is_array($FWD0uuidList)) {
    http_response_code(400);
    exit('FWD0 UUID list must be an array');
}
foreach ($FWD0uuidList as $node) {
    if (!is_array($node) || !isset($node['FWD0uuid']) || !is_string($node['FWD0uuid']) || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $node['FWD0uuid'])) {
        http_response_code(400);
        exit('FWD0 UUID list contains an invalid UUID');
    }
}

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) { http_response_code(500); exit('Forward configuration is unreadable or invalid'); }
$data['FORWARD']['FWD0'] = array();
$data['FORWARD']['FWD0']['status'] = "on";
$data['FORWARD']['FWD0']['port'] = $FWD0port;
$data['FORWARD']['FWD0']['uuid'] = $FWD0uuidList;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($newJsonString === false || file_put_contents('/opt/de_GWD/0conf', $newJsonString, LOCK_EX) !== strlen($newJsonString)) { http_response_code(500); exit('Unable to save forward configuration'); }

exec('sudo /opt/de_GWD/ui-FWD0save r &');
?>
<?php }?>
