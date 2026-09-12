<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$sites = array('Openai','Claude','Gemini','Grok','Wikipedia','Reddit','Github','Discord','Telegram','Twitter');
$conf = json_decode(file_get_contents('/opt/de_GWD/0conf'));
$nodeCount = count($conf->v2node);
$params = array();
foreach ($sites as $cap) {
    $key = 'nodeSMshow'.$cap;
    $val = isset($_GET[$key]) ? $_GET[$key] : '0';
    if (!is_numeric($val) || $val < 0 || $val > $nodeCount) { $val = '0'; }
    $params[] = $val;
}
exec('sudo /opt/de_GWD/ui-NodeSM r '.implode(' ', $params));
?>
<?php }?>
