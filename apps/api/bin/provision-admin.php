<?php

declare(strict_types=1);

use Lavbe\Api\Admin\AdminAuthService;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Database;

require dirname(__DIR__) . '/vendor/autoload.php';
$username=$argv[1]??'';$role=$argv[2]??'';$password=getenv('LAVBE_NEW_ADMIN_PASSWORD')?:'';
if($password===''&&function_exists('posix_isatty')&&posix_isatty(STDIN)){
    fwrite(STDERR,'New administrator password: ');shell_exec('stty -echo');
    try{$password=rtrim((string)fgets(STDIN),"\r\n");}finally{shell_exec('stty echo');fwrite(STDERR,"\n");}
}
if($username===''||$role===''||$password===''){
    fwrite(STDERR,"Usage: php bin/provision-admin.php <username> <owner|editor|reviewer|publisher> (password from protected environment or interactive terminal)\n");exit(2);
}
$config=Config::fromEnvironment();$pdo=Database::connect($config);
$user=(new AdminAuthService($pdo,$config,new Crypto($config)))->provisionUser($username,$password,$role);
fwrite(STDOUT,"Administrator provisioned. Enroll the one-time MFA secret and store recovery codes securely.\nMFA secret: ".$user['mfaSecret']."\nRecovery codes (shown once):\n".implode("\n",$user['recoveryCodes'])."\n");
