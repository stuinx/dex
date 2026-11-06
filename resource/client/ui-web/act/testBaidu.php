<?php require_once('../auth.php'); ?>
<?php if (!isset($auth) || !$auth) { http_response_code(401); exit('Authentication required'); } ?>
<?php
function onlineStatus(){
    $status = array("OFFLINE", "ONLINE");
    $handle = fsockopen("www.baidu.com",443,$errno,$errstr,2);
    if($handle)
        return $status[1];
    else
        return $status[0];
}

echo onlineStatus();
?>
