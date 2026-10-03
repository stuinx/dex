<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
exec('sudo nohup /usr/bin/ttyd -p 3000 -W -o /opt/de_GWD/ui-installFileRun &');
?>
<?php }?>
