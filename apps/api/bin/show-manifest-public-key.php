<?php

declare(strict_types=1);

use Lavbe\Api\Infrastructure\Config;

require dirname(__DIR__) . '/vendor/autoload.php';
$config = Config::fromEnvironment();
if ($config->manifestSigningSecretKey === null) {
    fwrite(STDERR, "Manifest signing key is not configured.\n");
    exit(1);
}
$publicKey = sodium_crypto_sign_publickey_from_secretkey($config->manifestSigningSecretKey);
fwrite(STDOUT, rtrim(strtr(base64_encode($publicKey), '+/', '-_'), '=') . "\n");
