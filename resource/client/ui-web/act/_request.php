<?php
function gwdRequestString($key) {
    $value = $_GET[$key] ?? null;
    if (!is_string($value) || $value === '' || preg_match('/[\x00-\x1f\x7f]/', $value)) {
        http_response_code(400);
        exit($key . ' must be a non-empty string without control characters');
    }
    return $value;
}

function gwdRequestIndex($key, $minimum = 0, $maximum = PHP_INT_MAX) {
    $value = gwdRequestString($key);
    $number = filter_var($value, FILTER_VALIDATE_INT, array('options' => array('min_range' => $minimum, 'max_range' => $maximum)));
    if ($number === false) {
        http_response_code(400);
        exit($key . ' is out of range');
    }
    return (string)$number;
}
