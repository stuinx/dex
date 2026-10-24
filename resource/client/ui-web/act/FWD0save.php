<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$FWD0port = $_GET['FWD0port'];
$FWD0uuidList = $_GET['FWD0uuidList'];
if (!is_string($FWD0port) || !preg_match('/^[0-9]{1,5}$/D', $FWD0port) || (int)$FWD0port < 1 || (int)$FWD0port > 65535) {
    http_response_code(400);
    exit('FWD0 port must be between 1 and 65535');
}

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$data['FORWARD']['FWD0'] = array();
$data['FORWARD']['FWD0']['status'] = "on";
$data['FORWARD']['FWD0']['port'] = $FWD0port;
$data['FORWARD']['FWD0']['uuid'] = $FWD0uuidList;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents('/opt/de_GWD/0conf', $newJsonString);

exec('sudo /opt/de_GWD/ui-FWD0save r &');
?>
<?php }?>
