<?php

declare(strict_types=1);

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
if ($socket === false) throw new RuntimeException('Could not reserve a local API test port.');
$address = stream_socket_get_name($socket, false);
fclose($socket);
$port = (int) substr(strrchr($address, ':'), 1);
$origin = 'http://127.0.0.1:' . $port;
$environment = getenv();
$environment = is_array($environment) ? $environment : [];
$environment = array_merge($environment, [
    'LAVBE_APP_ORIGIN' => $origin,
    'LAVBE_PUBLIC_ORIGIN' => $origin,
    'LAVBE_DATABASE_DSN' => getenv('LAVBE_TEST_DATABASE_DSN'),
    'LAVBE_DATABASE_USER' => getenv('LAVBE_TEST_DATABASE_USER') ?: '',
    'LAVBE_DATABASE_PASSWORD' => getenv('LAVBE_TEST_DATABASE_PASSWORD') ?: '',
    'LAVBE_ENCRYPTION_KEY_ID' => 'http-test',
    'LAVBE_ENCRYPTION_KEY' => str_repeat('h', 32),
    'LAVBE_RATE_KEY' => str_repeat('t', 32),
    'LAVBE_ALLOW_INSECURE_LOCAL' => '1',
    'LAVBE_AUTO_MIGRATE' => '1',
]);
$command = [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', dirname(__DIR__) . '/public', dirname(__DIR__) . '/public/router.php'];
$process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'a'], 2 => ['file', '/dev/null', 'a']], $pipes, dirname(__DIR__), $environment);
if (!is_resource($process)) throw new RuntimeException('Could not start the local API test server.');
fclose($pipes[0]);

$send = static function (string $path, string $method = 'GET', array $headers = [], ?string $body = null) use ($origin): array {
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", array_map(static fn (string $key, string $value): string => $key . ': ' . $value, array_keys($headers), $headers)), 'content' => $body ?? '', 'ignore_errors' => true, 'timeout' => 3]]);
    $content = @file_get_contents($origin . $path, false, $context);
    $responseHeaders = $http_response_header ?? [];
    preg_match('/^HTTP\/\S+\s+(\d+)/', $responseHeaders[0] ?? '', $match);
    $parsedHeaders = [];
    foreach (array_slice($responseHeaders, 1) as $line) {
        if (str_contains($line, ':')) [$name, $value] = explode(':', $line, 2) + ['', ''];
        else continue;
        $parsedHeaders[strtolower(trim($name))] = trim($value);
    }
    return [(int) ($match[1] ?? 0), $parsedHeaders, $content === false || $content === '' ? null : json_decode($content, true, flags: JSON_THROW_ON_ERROR)];
};
$assertOpenApiKeys = static function (array $value, array $schema, string $label): void {
    $expected = $schema['required'] ?? [];
    $actual = array_keys($value);
    sort($expected);
    sort($actual);
    if ($expected !== $actual || ($schema['additionalProperties'] ?? null) !== false) {
        throw new RuntimeException($label . ' does not match its closed OpenAPI object schema.');
    }
};

try {
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        [$status] = $send('/api/v1/health');
        if ($status === 200) { $ready = true; break; }
        usleep(50000);
    }
    if (!$ready) throw new RuntimeException('The API server did not become ready.');
    $wheel = json_decode(file_get_contents(dirname(__DIR__, 3) . '/contracts/examples/wheel.json'), true, flags: JSON_THROW_ON_ERROR);
    $key = 'b44f8c12-23bb-4b85-b01e-a912b86d9a11';
    $headers = ['Origin' => $origin, 'Content-Type' => 'application/json', 'Idempotency-Key' => $key];
    $payload = json_encode(['wheel' => $wheel, 'ttlDays' => 1], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $openapi = json_decode(file_get_contents(dirname(__DIR__, 3) . '/contracts/openapi.json'), true, flags: JSON_THROW_ON_ERROR);
    $createdSchema = $openapi['components']['schemas']['CreatedShare'];
    $sharedSchema = $openapi['components']['schemas']['SharedWheel'];
    $errorSchema = $openapi['components']['schemas']['Error'];
    if (!isset($openapi['paths']['/api/v1/shares']['post'], $openapi['paths']['/api/v1/shares/{shareId}']['get'], $openapi['paths']['/api/v1/shares/{shareId}']['delete'])) {
        throw new RuntimeException('The expected public API operations are absent from OpenAPI.');
    }
    [$status, $headersRead, $created] = $send('/api/v1/shares', 'POST', $headers, $payload);
    if ($status !== 201 || ($headersRead['cache-control'] ?? '') !== 'no-store, private') throw new RuntimeException('HTTP create did not follow the API contract.');
    $assertOpenApiKeys($created, $createdSchema, 'Create response');
    [$replayStatus, , $replayed] = $send('/api/v1/shares', 'POST', $headers, $payload);
    if ($replayStatus !== 201 || $replayed !== $created) throw new RuntimeException('HTTP idempotency replay did not return the same capability.');
    [$conflictStatus, , $conflict] = $send('/api/v1/shares', 'POST', $headers, json_encode(['wheel' => $wheel, 'ttlDays' => 7], JSON_THROW_ON_ERROR));
    if ($conflictStatus !== 409 || ($conflict['error']['code'] ?? '') !== 'IDEMPOTENCY_CONFLICT') throw new RuntimeException('HTTP idempotency conflict was not rejected.');
    [$readStatus, $readHeaders, $shared] = $send('/api/v1/shares/' . $created['shareId']);
    if ($readStatus !== 200 || ($readHeaders['x-robots-tag'] ?? '') !== 'noindex, nofollow, noarchive' || $shared['wheel']['title'] !== $wheel['title']) throw new RuntimeException('HTTP shared snapshot read failed.');
    $assertOpenApiKeys($shared, $sharedSchema, 'Shared response');
    [$invalidJsonStatus, , $invalidJson] = $send('/api/v1/shares', 'POST', ['Origin' => $origin, 'Content-Type' => 'application/json', 'Idempotency-Key' => 'ef4cac07-5f56-4ff8-965d-328a3b4eea9b'], '{');
    if ($invalidJsonStatus !== 400) throw new RuntimeException('HTTP malformed JSON was not rejected.');
    $assertOpenApiKeys($invalidJson, $errorSchema, 'Validation error response');
    [$malformedIdStatus] = $send('/api/v1/shares/not-a-share-id');
    [$unknownShareStatus] = $send('/api/v1/shares/' . str_repeat('a', 32));
    if ($malformedIdStatus !== 400 || $unknownShareStatus !== 404) throw new RuntimeException('HTTP share identifier errors did not distinguish malformed from unknown.');
    [$oversizedStatus] = $send('/api/v1/shares', 'POST', ['Origin' => $origin, 'Content-Type' => 'application/json'], str_repeat('x', 262145));
    if ($oversizedStatus !== 413) throw new RuntimeException('HTTP oversized request body was not rejected.');
    [$originStatus] = $send('/api/v1/shares', 'POST', ['Origin' => 'https://evil.test', 'Content-Type' => 'application/json', 'Idempotency-Key' => 'ef4cac07-5f56-4ff8-965d-328a3b4eea9b'], $payload);
    if ($originStatus !== 403) throw new RuntimeException('HTTP untrusted Origin was not rejected.');
    [$badCapability] = $send('/api/v1/shares/' . $created['shareId'], 'DELETE', ['Origin' => $origin, 'Authorization' => 'Bearer ' . str_repeat('x', 43)]);
    if ($badCapability !== 401) throw new RuntimeException('HTTP invalid management capability was not rejected.');
    [$revokeStatus] = $send('/api/v1/shares/' . $created['shareId'], 'DELETE', ['Origin' => $origin, 'Authorization' => 'Bearer ' . $created['manageToken']]);
    [$goneStatus, , $gone] = $send('/api/v1/shares/' . $created['shareId']);
    if ($revokeStatus !== 204 || $goneStatus !== 410 || ($gone['error']['code'] ?? '') !== 'UNAVAILABLE') throw new RuntimeException('HTTP revocation lifecycle failed.');
    $assertOpenApiKeys($gone, $errorSchema, 'Unavailable error response');
    fwrite(STDOUT, "PASS: live HTTP health/create/replay/conflict/read/origin/capability/revoke lifecycle.\n");
} finally {
    proc_terminate($process);
    proc_close($process);
}
