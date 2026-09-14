v1.26.6
-
<?php
$str= file_get_contents('https://raw.githubusercontent.com/stuinx/dex/feat/scratch-features/version.php');
$array=explode('-', $str);
echo $array[0];
?>
