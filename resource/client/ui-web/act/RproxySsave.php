<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$RproxyStunnelPort = $_GET['RproxyStunnelPort'] ?? '';
$RproxyStunnelUUID = $_GET['RproxyStunnelUUID'] ?? '';
$RproxySmappingStatus = $_GET['RproxySmappingStatus'] ?? '';
$RproxyS1List = $_GET['RproxyS1List'] ?? array();
if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $RproxyStunnelUUID)) {
  $RproxyUUIDBytes = random_bytes(16);
  $RproxyUUIDBytes[6] = chr((ord($RproxyUUIDBytes[6]) & 0x0f) | 0x40);
  $RproxyUUIDBytes[8] = chr((ord($RproxyUUIDBytes[8]) & 0x3f) | 0x80);
  $RproxyUUIDHex = bin2hex($RproxyUUIDBytes);
  $RproxyStunnelUUID = substr($RproxyUUIDHex, 0, 8) . '-' . substr($RproxyUUIDHex, 8, 4) . '-' . substr($RproxyUUIDHex, 12, 4) . '-' . substr($RproxyUUIDHex, 16, 4) . '-' . substr($RproxyUUIDHex, 20, 12);
}

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$data['FORWARD']['Rproxy']['server'] = array();
$data['FORWARD']['Rproxy']['server']['status'] = "on";
$data['FORWARD']['Rproxy']['server']['inStatus'] = "off";
$data['FORWARD']['Rproxy']['server']['mappingStatus'] = ($RproxySmappingStatus === 'block') ? "on" : "off";
$data['FORWARD']['Rproxy']['server']['tunnel']['port'] = $RproxyStunnelPort;
$data['FORWARD']['Rproxy']['server']['tunnel']['uuid'] = $RproxyStunnelUUID;
$data['FORWARD']['Rproxy']['server']['inUUID'] = array();
$data['FORWARD']['Rproxy']['server']['mapping'] = $RproxyS1List;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents('/opt/de_GWD/0conf', $newJsonString);

exec('sudo /opt/de_GWD/ui-RproxySsave &');
?>
<?php }?>
