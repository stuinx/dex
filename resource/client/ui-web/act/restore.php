<?php require_once('../auth.php'); ?>
<?php if (isset($auth) && $auth) {?>
<?php
if ($_FILES["file"]["name"] == "de_GWD_bak")
{
	move_uploaded_file($_FILES['file']['tmp_name'], '../restore/' . "de_GWD_bak");
	exec('sudo /opt/de_GWD/ui-restore &');
}
?>
<?php }?>
