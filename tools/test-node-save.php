<?php
$sourcePath = $argv[1] ?? '';
if ($sourcePath === '' || !is_file($sourcePath)) {
    fwrite(STDERR, "Usage: php test-node-save.php /path/to/NodeSave.php [case|all]\n");
    exit(2);
}
$source = file_get_contents($sourcePath);
$validNode = [
    'domain' => 'vless.example:443',
    'tls' => 'vless.example',
    'name' => 'VLESS fixture',
    'uuid' => '00000000-0000-4000-8000-000000000001',
    'path' => '/vless',
    'protocol' => 'vless',
];
$cases = [
    'valid-vless' => ['nodeList' => [$validNode], 'status' => 200, 'savedNodes' => [$validNode]],
    'valid-tcp-vless' => ['nodeList' => [array_merge($validNode, ['path' => ''])], 'status' => 200, 'savedNodes' => [array_merge($validNode, ['path' => ''])]],
    'empty-list' => ['nodeList' => [], 'status' => 200, 'savedNodes' => []],
    'reject-unauthenticated' => ['nodeList' => [$validNode], 'auth' => false, 'status' => 401, 'message' => 'Authentication required'],
    'reject-protocol' => ['nodeList' => [array_merge($validNode, ['protocol' => 'vmess'])], 'status' => 400, 'message' => 'Only VLESS nodes are supported'],
    'reject-domain' => ['nodeList' => [array_merge($validNode, ['domain' => 'vless.example'])], 'status' => 400, 'message' => 'domain must be host:port'],
    'reject-port' => ['nodeList' => [array_merge($validNode, ['domain' => 'vless.example:65536'])], 'status' => 400, 'message' => 'domain must be host:port'],
    'reject-name' => ['nodeList' => [array_merge($validNode, ['name' => ' '])], 'status' => 400, 'message' => 'name is required'],
    'reject-uuid' => ['nodeList' => [array_merge($validNode, ['uuid' => 'invalid'])], 'status' => 400, 'message' => 'uuid must be a valid UUID'],
    'reject-path' => ['nodeList' => [array_merge($validNode, ['path' => 'vless'])], 'status' => 400, 'message' => 'path must be empty or start with /'],
    'reject-tls' => ['nodeList' => [array_merge($validNode, ['tls' => 'https://vless.example'])], 'status' => 400, 'message' => 'tls must be a hostname or IPv4 address'],
    'reject-node-list' => ['nodeList' => 'invalid', 'status' => 400, 'message' => 'nodeList must be an array'],
];
$caseName = $argv[2] ?? 'all';
if ($caseName === 'all') {
    foreach (array_keys($cases) as $name) {
        $process = proc_open([PHP_BINARY, __FILE__, $sourcePath, $name], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            fwrite(STDERR, "Unable to start NodeSave test case\n");
            exit(1);
        }
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        $status = proc_close($process);
        echo $stdout;
        if ($status !== 0) {
            fwrite(STDERR, $stderr);
            exit($status);
        }
    }
    exit(0);
}
if (!isset($cases[$caseName])) {
    fwrite(STDERR, "Unknown NodeSave test case: $caseName\n");
    exit(2);
}
$testCase = $cases[$caseName];
$config = tempnam(sys_get_temp_dir(), 'dex-node-save-');
$original = json_encode(['v2node' => [], 'untouched' => true]);
file_put_contents($config, $original);
$authValue = ($testCase['auth'] ?? true) ? 'true' : 'false';
$source = str_replace("<?php require_once('../auth.php'); ?>", '<?php $auth = ' . $authValue . '; ?>', $source);
$source = str_replace('/opt/de_GWD/0conf', $config, $source);
$source = str_replace("exec('sudo /opt/de_GWD/ui-NodeSave r &');", '', $source);
$_GET = ['nodeList' => $testCase['nodeList']];
register_shutdown_function(function() use ($config, $original, $testCase, $caseName) {
    $saved = file_get_contents($config);
    $json = json_decode($saved, true);
    $response = ob_get_contents();
    ob_end_clean();
    $responseCode = http_response_code();
    $ok = $responseCode === $testCase['status'] || ($testCase['status'] === 200 && $responseCode === false);
    if ($testCase['status'] === 200) {
        $ok = $ok && $json['v2node'] === $testCase['savedNodes'] && $json['untouched'] === true;
    } else {
        $ok = $ok && $saved === $original && strpos($response, $testCase['message']) !== false;
    }
    unlink($config);
    if (!$ok) {
        fwrite(STDERR, "NodeSave assertion failed: $caseName (status=" . var_export($responseCode, true) . ", savedNodes=" . (isset($json['v2node']) ? 'yes' : 'no') . ", response=" . trim($response) . ")\n");
        exit(1);
    }
    echo "PASS: NodeSave $caseName\n";
});
ob_start();
eval('?>' . $source);
