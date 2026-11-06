<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
require_once __DIR__ . '/_request.php';
$autoUpdateHourINDEX = gwdRequestString('autoUpdateHourINDEX');
if ($autoUpdateHourINDEX !== 'off') { $autoUpdateHourINDEX = gwdRequestIndex('autoUpdateHourINDEX', 0, 23); }

$data = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$data['address']['autoUpdateHour'] = $autoUpdateHourINDEX;
$newJsonString = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
file_put_contents('/opt/de_GWD/0conf', $newJsonString);

exec('sudo /opt/de_GWD/ui-autoUpdateHour ' . escapeshellarg($autoUpdateHourINDEX) . ' &');
?>
<?php }?>
