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

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$data['FORWARD']['FWD1'] = array();
$data['FORWARD']['FWD1']['status'] = "on";
$data['FORWARD']['FWD1']['port'] = $FWD1port;
$data['FORWARD']['FWD1']['uuid'] = $FWD1uuidList;
$data['FORWARD']['FWD1']['upstream'] = $FWD1upstream;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents('/opt/de_GWD/0conf', $newJsonString);

exec('sudo /opt/de_GWD/ui-FWD1save &');
?>
<?php }?>
