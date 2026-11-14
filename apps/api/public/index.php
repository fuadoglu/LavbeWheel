<?php

declare(strict_types=1);

use Lavbe\Api\Application\ShareService;
use Lavbe\Api\Domain\WheelRequestValidator;
use Lavbe\Api\Domain\WheelSemanticValidator;
use Lavbe\Api\Http\ApiKernel;
use Lavbe\Api\Http\Request;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Database;
use Lavbe\Api\Infrastructure\MigrationRunner;

require dirname(__DIR__) . '/vendor/autoload.php';
try {
    $config = Config::fromEnvironment();
    $pdo = Database::connect($config);
    if (getenv('LAVBE_AUTO_MIGRATE') === '1') {
        (new MigrationRunner($pdo))->migrate();
    }
    $shares = new ShareService($pdo, $config, new Crypto($config), new WheelRequestValidator(new WheelSemanticValidator()));
    (new ApiKernel($config, $shares))->handle(Request::fromGlobals())->emit();
} catch (Throwable) {
    http_response_code(503);
    header('Cache-Control: no-store, private');
    header('Retry-After: 30');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => ['code' => 'SERVICE_UNAVAILABLE', 'message' => 'The service is temporarily unavailable.'], 'requestId' => bin2hex(random_bytes(16))]);
}
