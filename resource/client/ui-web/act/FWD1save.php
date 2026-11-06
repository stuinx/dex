<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$FWD1port = $_GET['FWD1port'];
$FWD1uuidList = $_GET['FWD1uuidList'];
$FWD1upstream = $_GET['FWD1upstream'];
if (!is_string($FWD1port) || !preg_match('/^[0-9]{1,5}$/D', $FWD1port) || (int)$FWD1port < 1 || (int)$FWD1port > 65535) {
    http_response_code(400);
    exit('FWD1 port must be between 1 and 65535');
}

if (!is_array($FWD1uuidList)) {
    http_response_code(400);
    exit('FWD1 UUID list must be an array');
}
foreach ($FWD1uuidList as $node) {
    if (!is_array($node) || !isset($node['FWD1uuid']) || !is_string($node['FWD1uuid']) || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $node['FWD1uuid'])) {
        http_response_code(400);
        exit('FWD1 UUID list contains an invalid UUID');
    }
}

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) { http_response_code(500); exit('Forward configuration is unreadable or invalid'); }
$data['FORWARD']['FWD1'] = array();
$data['FORWARD']['FWD1']['status'] = "on";
$data['FORWARD']['FWD1']['port'] = $FWD1port;
$data['FORWARD']['FWD1']['uuid'] = $FWD1uuidList;
$data['FORWARD']['FWD1']['upstream'] = $FWD1upstream;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($newJsonString === false || file_put_contents('/opt/de_GWD/0conf', $newJsonString, LOCK_EX) !== strlen($newJsonString)) { http_response_code(500); exit('Unable to save forward configuration'); }

exec('sudo /opt/de_GWD/ui-FWD1save &');
?>
<?php }?>
