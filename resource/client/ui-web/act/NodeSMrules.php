<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
$nodeSMshowYoutube = $_GET['nodeSMshowYoutube'];
$nodeSMshowNetflix = $_GET['nodeSMshowNetflix'];
$nodeSMshowHDH = $_GET['nodeSMshowHDH'];
$nodeSMshowTVB = $_GET['nodeSMshowTVB'];
$nodeSMshowBahamut = $_GET['nodeSMshowBahamut'];
$nodeSMshowOpenai = $_GET['nodeSMshowOpenai'];
$nodeSMshowApple = $_GET['nodeSMshowApple'];
$nodeSMshowSteam = $_GET['nodeSMshowSteam'];
$nodeSMshowClaude = $_GET['nodeSMshowClaude'];
$nodeSMshowGemini = $_GET['nodeSMshowGemini'];
$nodeSMshowGrok = $_GET['nodeSMshowGrok'];
$nodeSMshowWikipedia = $_GET['nodeSMshowWikipedia'];
$nodeSMshowReddit = $_GET['nodeSMshowReddit'];
$nodeSMshowGithub = $_GET['nodeSMshowGithub'];
$nodeSMshowDiscord = $_GET['nodeSMshowDiscord'];
$nodeSMshowTelegram = $_GET['nodeSMshowTelegram'];
$nodeSMshowTwitter = $_GET['nodeSMshowTwitter'];
exec("sudo /opt/de_GWD/ui-NodeSM r $nodeSMshowYoutube $nodeSMshowNetflix $nodeSMshowHDH $nodeSMshowTVB $nodeSMshowBahamut $nodeSMshowOpenai $nodeSMshowApple $nodeSMshowSteam $nodeSMshowClaude $nodeSMshowGemini $nodeSMshowGrok $nodeSMshowWikipedia $nodeSMshowReddit $nodeSMshowGithub $nodeSMshowDiscord $nodeSMshowTelegram $nodeSMshowTwitter");
?>
<?php }?>
