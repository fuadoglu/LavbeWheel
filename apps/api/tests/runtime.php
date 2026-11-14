<?php

declare(strict_types=1);

$required = ['intl', 'mbstring', 'pdo_mysql', 'sodium'];
$missing = array_values(array_filter($required, static fn (string $extension): bool => !extension_loaded($extension)));
if (PHP_VERSION_ID < 80300 || $missing !== []) {
    fwrite(STDERR, 'API runtime prerequisites missing: PHP >= 8.3 and extensions ' . implode(', ', $missing) . PHP_EOL);
    exit(1);
}
printf("PASS: PHP %s and required API extensions are available.\n", PHP_VERSION);
