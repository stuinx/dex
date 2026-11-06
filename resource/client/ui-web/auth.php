<?php
    $requestScheme = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off' ? 'https' : 'http';
    if (strpos($_SERVER['SCRIPT_NAME'] ?? '', '/act/') !== false) {
        if (strtolower(trim($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') {
            http_response_code(403);
            exit('Cross-site requests are not allowed');
        }
        $requestOrigin = parse_url($requestScheme . '://' . ($_SERVER['HTTP_HOST'] ?? ''));
        foreach (array('HTTP_ORIGIN', 'HTTP_REFERER') as $sourceHeader) {
            if (!isset($_SERVER[$sourceHeader])) {
                continue;
            }
            $sourceOrigin = parse_url($_SERVER[$sourceHeader]);
            if ($sourceOrigin === false || $requestOrigin === false || !isset($sourceOrigin['scheme'], $sourceOrigin['host'], $requestOrigin['host']) ||
                strtolower($sourceOrigin['scheme']) !== $requestScheme ||
                strcasecmp($sourceOrigin['host'], $requestOrigin['host']) !== 0 ||
                ($sourceOrigin['port'] ?? ($requestScheme === 'https' ? 443 : 80)) !== ($requestOrigin['port'] ?? ($requestScheme === 'https' ? 443 : 80))) {
                http_response_code(403);
                exit('Request origin does not match this server');
            }
        }
    }
    $sessionCookieParams = session_get_cookie_params();
    $sessionCookieParams['httponly'] = true;
    $sessionCookieParams['samesite'] = 'Strict';
    $sessionCookieParams['secure'] = $requestScheme === 'https';
    session_set_cookie_params($sessionCookieParams);
    session_start();
    $PWDhash = json_decode(file_get_contents('/opt/de_GWD/0conf'))->address->PWD;
    if(isset($PWDhash))
    {
        $GWDpwhash = $PWDhash;
    }
    else
    {
        $GWDpwhash = "";
    }


    if(isset($_GET['logout']))
    {
        unset($_SESSION["GWDhash"]);
        setcookie('persistentlogin', '');
        exit();
    }
    $auth = false;


    if(isset($_GET['gwdpw']))
    {
        $logininput = hash('sha256',hash('sha256',$_GET['gwdpw']));
        if( $GWDpwhash === $logininput )
        {
            $_SESSION["GWDhash"] = $GWDpwhash;
            $auth = true;
        }
        else
        {
            $auth = false;
        }
    }
    else if (isset($_SESSION["GWDhash"]))
    {
        if($_SESSION["GWDhash"] === $GWDpwhash)
        {
            $auth = true;
        }
        else
        {
            $auth = false;
        }
    }
    else
    {
        $auth = false;
    }
    session_write_close();
?>