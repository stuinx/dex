v1.26.7
-
<?php
$urls = array(
  'https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/main/version.php',
  'https://gh-proxy.com/https://raw.githubusercontent.com/stuinx/dex/main/version.php',
  'https://raw.githubusercontent.com/stuinx/dex/main/version.php',
);
$str = '';
foreach ($urls as $u) {
  $str = @file_get_contents($u);
  if ($str) break;
}
$array=explode('-', $str);
echo $array[0];
?>
