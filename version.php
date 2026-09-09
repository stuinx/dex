dev
-
<?php
$urls = array(
  'https://ghfast.top/https://raw.githubusercontent.com/stuinx/dex/dev/version.php',
  'https://gh-proxy.com/https://raw.githubusercontent.com/stuinx/dex/dev/version.php',
  'https://raw.githubusercontent.com/stuinx/dex/dev/version.php',
);
$str = '';
foreach ($urls as $u) {
  $str = @file_get_contents($u);
  if ($str) break;
}
$array=explode('-', $str);
echo $array[0];
?>
