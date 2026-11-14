<?php

declare(strict_types=1);

require __DIR__ . '/runtime.php';
require __DIR__ . '/semantic.php';
require __DIR__ . '/request-validator.php';
require __DIR__ . '/http-kernel.php';
require __DIR__ . '/admin-schema.php';
require __DIR__ . '/canonical-json.php';
if (getenv('LAVBE_TEST_DATABASE_DSN')) {
    require __DIR__ . '/database-lifecycle.php';
} else {
    fwrite(STDERR, "BLOCKED: DB lifecycle HTTP integration requires isolated MySQL test DB (LAVBE_TEST_DATABASE_DSN).\n");
    exit(2);
}
require __DIR__ . '/http-integration.php';
