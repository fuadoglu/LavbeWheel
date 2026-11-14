<?php

declare(strict_types=1);

use Lavbe\Api\Admin\AdminAuthService;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Database;

require dirname(__DIR__) . '/vendor/autoload.php';
$username = $argv[1] ?? '';
$password = getenv('LAVBE_BOOTSTRAP_PASSWORD') ?: '';
if ($password === '' && function_exists('posix_isatty') && posix_isatty(STDIN)) {
    fwrite(STDERR, 'New owner password: ');
    shell_exec('stty -echo');
    $password = rtrim((string) fgets(STDIN), "\r\n");
    shell_exec('stty echo');
    fwrite(STDERR, "\n");
}
if ($username === '' || $password === '') {
    fwrite(STDERR, 'Usage: php bin/bootstrap-admin.php <username> (password from protected environment or interactive terminal)\n');
    exit(2);
}
$pdo = Database::connect(Config::fromEnvironment());
$config = Config::fromEnvironment();
$result = (new AdminAuthService($pdo, $config, new Crypto($config)))->bootstrapOwner($username, $password);
fwrite(STDOUT, "First owner created. Configure MFA before closing this terminal.\n");
fwrite(STDOUT, 'MFA secret (shown once): ' . $result['mfaSecret'] . "\n");
fwrite(STDOUT, "Recovery codes (shown once):\n" . implode("\n", $result['recoveryCodes']) . "\n");
