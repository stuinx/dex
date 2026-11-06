<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
function onlineStatus(){
	$status = array("OFFLINE", "ONLINE");
    $handle = fsockopen("youtube.com",443,$errno,$errstr,30);
    if($handle)
        return $status[1];
    else
        return $status[0];
}

echo onlineStatus();
?>
