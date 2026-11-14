<?php

declare(strict_types=1);

use Lavbe\Api\Application\ShareService;
use Lavbe\Api\Domain\WheelRequestValidator;
use Lavbe\Api\Domain\WheelSemanticValidator;
use Lavbe\Api\Http\ApiKernel;
use Lavbe\Api\Http\Request;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;

require_once dirname(__DIR__) . '/vendor/autoload.php';
$key = str_repeat('k', 32);
$config = new Config('https://lavbe.test', 'https://lavbe.test', 'mysql:host=127.0.0.1;dbname=unused', '', '', 'test', $key, str_repeat('r', 32));
$pdo = new PDO('sqlite::memory:');
$shares = new ShareService($pdo, $config, new Crypto($config), new WheelRequestValidator(new WheelSemanticValidator()));
$kernel = new ApiKernel($config, $shares);
$request = static fn (string $method, string $path, array $headers = [], string $body = '', int $length = 0): Request => new Request($method, $path, array_change_key_case($headers, CASE_LOWER), $body, '127.0.0.1', 'https', $length);
$health = $kernel->handle($request('GET', '/api/v1/health'), 1);
if ($health->status !== 200 || ($health->body['status'] ?? null) !== 'ok' || ($health->headers['Cache-Control'] ?? '') !== 'no-store, private') {
    throw new RuntimeException('Health endpoint response contract failed.');
}
$origin = $kernel->handle($request('POST', '/api/v1/shares', ['Origin' => 'https://evil.test']), 1);
if ($origin->status !== 403 || ($origin->body['error']['code'] ?? '') !== 'UNSUPPORTED_ORIGIN') {
    throw new RuntimeException('Untrusted Origin was not rejected.');
}
$large = $kernel->handle($request('POST', '/api/v1/shares', [], '', 262145), 1);
if ($large->status !== 413 || ($large->body['error']['code'] ?? '') !== 'BODY_TOO_LARGE') {
    throw new RuntimeException('Oversized request was not rejected.');
}
$unknown = $kernel->handle($request('GET', '/api/v1/does-not-exist'), 1);
if ($unknown->status !== 404 || isset($unknown->body['wheel'])) {
    throw new RuntimeException('Unknown route response contract failed.');
}
$oldConfig = new Config('https://lavbe.test', 'https://lavbe.test', 'mysql:host=127.0.0.1;dbname=unused', '', '', 'old', str_repeat('o', 32), str_repeat('r', 32));
$currentConfig = new Config('https://lavbe.test', 'https://lavbe.test', 'mysql:host=127.0.0.1;dbname=unused', '', '', 'new', str_repeat('n', 32), str_repeat('r', 32), [], ['old' => str_repeat('o', 32), 'new' => str_repeat('n', 32)]);
$oldCipher = (new Crypto($oldConfig))->encrypt('rotation-check', 'test-context');
if ((new Crypto($currentConfig))->decrypt($oldCipher['cipher'], $oldCipher['nonce'], $oldCipher['keyId'], 'test-context') !== 'rotation-check') {
    throw new RuntimeException('Retained encryption key could not decrypt an older payload.');
}
fwrite(STDOUT, "PASS: API kernel health, no-store, origin, body-size and unknown-route contracts.\n");
