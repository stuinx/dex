<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$nodeSMkeys = array('youtube', 'claude', 'gemini', 'grok', 'wikipedia', 'reddit', 'github', 'discord', 'telegram', 'x', 'openai', 'apple', 'steam');
$nodeSMargs = array('r');
foreach ($nodeSMkeys as $nodeSMkey) {
  $nodeSMparam = 'nodeSMshow' . ucfirst($nodeSMkey);
  $nodeSMvalue = filter_input(INPUT_GET, $nodeSMparam, FILTER_VALIDATE_INT);
  $nodeSMargs[] = ($nodeSMvalue !== false && $nodeSMvalue !== null && $nodeSMvalue >= 0) ? (string)$nodeSMvalue : '0';
}
exec('sudo /opt/de_GWD/ui-NodeSM ' . implode(' ', array_map('escapeshellarg', $nodeSMargs)));
?>
<?php }?>
