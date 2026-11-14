<?php

declare(strict_types=1);

use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Database;
use Lavbe\Api\Infrastructure\MigrationRunner;

require dirname(__DIR__) . '/vendor/autoload.php';
$pdo = Database::connect(Config::fromEnvironment());
(new MigrationRunner($pdo))->migrate();
fwrite(STDOUT, "API schema migrations applied.\n");
