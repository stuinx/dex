v1.26.7
-
<?php
$str= file_get_contents('https://raw.githubusercontent.com/stuinx/dex/main/version.php');
$array=explode('-', $str);
echo $array[0];
?>
