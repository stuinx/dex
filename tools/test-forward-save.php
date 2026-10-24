<?php
$repo = dirname(__DIR__);
$cases = [
    ['FWD0save.php', ['FWD0port' => '1', 'FWD0uuidList' => []], 200],
    ['FWD0save.php', ['FWD0port' => '65535', 'FWD0uuidList' => []], 200],
    ['FWD0save.php', ['FWD0port' => '0', 'FWD0uuidList' => []], 400],
    ['FWD0save.php', ['FWD0port' => '65536', 'FWD0uuidList' => []], 400],
    ['FWD0save.php', ['FWD0port' => 'abc', 'FWD0uuidList' => []], 400],
    ['FWD1save.php', ['FWD1port' => '1', 'FWD1uuidList' => [], 'FWD1upstream' => 'node'], 200],
    ['FWD1save.php', ['FWD1port' => '65535', 'FWD1uuidList' => [], 'FWD1upstream' => 'node'], 200],
    ['FWD1save.php', ['FWD1port' => '0', 'FWD1uuidList' => [], 'FWD1upstream' => 'node'], 400],
    ['FWD1save.php', ['FWD1port' => '65536', 'FWD1uuidList' => [], 'FWD1upstream' => 'node'], 400],
];
foreach ($cases as [$file, $query, $expected]) {
    $source = file_get_contents($repo . '/resource/client/ui-web/act/' . $file);
    $config = tempnam(sys_get_temp_dir(), 'dex-forward-save-');
    $original = json_encode(['FORWARD' => ['untouched' => true]]);
    file_put_contents($config, $original);
    $source = str_replace("<?php require_once('../auth.php'); ?>", '<?php $auth = true; ?>', $source);
    $source = str_replace("file_get_contents('/opt/de_GWD/0conf')", "file_get_contents('$config')", $source);
    $source = str_replace('file_put_contents(\'/opt/de_GWD/0conf\', $newJsonString)', 'file_put_contents(\'' . $config . '\', $newJsonString)', $source);
    $source = preg_replace("/exec\('sudo \/opt\/de_GWD\/ui-FWD[01]save[^']*'\);/", '', $source);
    $encoded = base64_encode(json_encode($query));
    $script = tempnam(sys_get_temp_dir(), 'dex-forward-script-');
    $prefix = '<?php $_GET = json_decode(base64_decode(' . var_export($encoded, true) . '), true); register_shutdown_function(function(){ echo "\\n__STATUS__" . (http_response_code() ?: 200); }); ?>';
    file_put_contents($script, $prefix . $source);
    $output = [];
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($script), $output, $status);
    $saved = file_get_contents($config);
    $response = implode("\n", $output);
    preg_match('/__STATUS__(\\d+)/', $response, $match);
    $code = isset($match[1]) ? (int)$match[1] : $status;
    $savedData = json_decode($saved, true);
    $portKey = substr($file, 0, 4) === 'FWD0' ? 'FWD0port' : 'FWD1port';
    $savedPort = $savedData['FORWARD'][$portKey === 'FWD0port' ? 'FWD0' : 'FWD1']['port'] ?? null;
    if ($code !== $expected || ($expected === 400 && $saved !== $original) || ($expected === 200 && (string)$savedPort !== $query[$portKey])) {
        fwrite(STDERR, "FAIL $file port={$query[array_key_first($query)]}: expected $expected, got $code\n$response\n");
        exit(1);
    }
    unlink($config);
    unlink($script);
    echo "PASS $file port validation\n";
}
