<?php require_once('../auth.php'); ?>
<?php
if (!isset($auth) || !$auth) {
    http_response_code(401);
    exit('Authentication required');
}
?>
<?php if (isset($auth) && $auth) {?>
<?php
$conf = json_decode(file_get_contents('/opt/de_GWD/0conf'), true);
$nodeList = $_GET['nodeList'] ?? [];
if (!is_array($nodeList)) {
    http_response_code(400);
    exit('nodeList must be an array');
}
$nodeNumber = 0;
foreach ($nodeList as $node) {
    $nodeNumber++;
    if (!is_array($node)) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ' must be an object');
    }
    if (($node['protocol'] ?? '') !== 'vless') {
        http_response_code(400);
        exit('Only VLESS nodes are supported');
    }
    $domain = $node['domain'] ?? '';
    if (!is_string($domain) || !preg_match('/^([A-Za-z0-9.-]+):([0-9]{1,5})$/D', $domain, $domainParts)) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': domain must be host:port');
    }
    $host = $domainParts[1];
    $port = (int) $domainParts[2];
    if ($port < 1 || $port > 65535 || (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false && filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false)) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': domain must be host:port');
    }
    if (!isset($node['name']) || !is_string($node['name']) || trim($node['name']) === '') {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': name is required');
    }
    if (!isset($node['uuid']) || !is_string($node['uuid']) || !preg_match('/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iD', $node['uuid'])) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': uuid must be a valid UUID');
    }
    $path = $node['path'] ?? '';
    if (!is_string($path) || ($path !== '' && !preg_match('/^\/[\x21-\x7e\x80-\xff]*$/D', $path))) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': path must be empty or start with /');
    }
    $tls = $node['tls'] ?? '';
    if (!is_string($tls) || ($tls !== '' && filter_var($tls, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false && filter_var($tls, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false)) {
        http_response_code(400);
        exit('Node ' . $nodeNumber . ': tls must be a hostname or IPv4 address');
    }
}

$conf['v2node'] = $nodeList;
$newJsonString = json_encode($conf, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($newJsonString === false || file_put_contents('/opt/de_GWD/0conf', $newJsonString) === false) {
    http_response_code(500);
    exit('Unable to save node configuration');
}

exec('sudo /opt/de_GWD/ui-NodeSave r &');
?>
<?php }?>
