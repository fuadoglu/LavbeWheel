<?php

declare(strict_types=1);

use Lavbe\Api\Admin\AdminAuthService;
use Lavbe\Api\Admin\Totp;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Database;

require_once dirname(__DIR__) . '/vendor/autoload.php';
if (!Totp::verify('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59, 0)) {
    throw new RuntimeException('TOTP implementation failed the RFC 6238 SHA-1 test vector.');
}
$testConfig = new Config('https://lavbe.test', 'https://lavbe.test', getenv('LAVBE_TEST_DATABASE_DSN'), getenv('LAVBE_TEST_DATABASE_USER') ?: '', getenv('LAVBE_TEST_DATABASE_PASSWORD') ?: '', 'http-test', str_repeat('h', 32), str_repeat('t', 32));
$manifestSigningPair = sodium_crypto_sign_seed_keypair(str_repeat('m', SODIUM_CRYPTO_SIGN_SEEDBYTES));
$manifestSigningSecret = sodium_crypto_sign_secretkey($manifestSigningPair);
$manifestSigningPublic = sodium_crypto_sign_publickey($manifestSigningPair);
$testPdo = Database::connect($testConfig);
$adminAuth = new AdminAuthService($testPdo, $testConfig, new Crypto($testConfig));
$admin = $adminAuth->bootstrapOwner('owner_test', 'TestPassword!Asecure123');
$totp = static function (string $secret, int $timestamp): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($secret) as $char) $bits .= str_pad(decbin(strpos($alphabet, $char)), 5, '0', STR_PAD_LEFT);
    $binary = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $binary .= chr(bindec($byte));
    $counter = intdiv($timestamp, 30);
    $hash = hash_hmac('sha1', pack('N2', intdiv($counter, 0x100000000), $counter & 0xffffffff), $binary, true);
    $index = ord($hash[19]) & 0x0f;
    $value = ((ord($hash[$index]) & 0x7f) << 24) | ((ord($hash[$index + 1]) & 0xff) << 16) | ((ord($hash[$index + 2]) & 0xff) << 8) | (ord($hash[$index + 3]) & 0xff);
    return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
};
$editor = $adminAuth->provisionUser('editor_test','TestEditorPassword!Secure123','editor');

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
    'LAVBE_MANIFEST_SIGNING_SECRET_KEY' => base64_encode($manifestSigningSecret),
    'LAVBE_ALLOW_INSECURE_LOCAL' => '1',
    'LAVBE_AUTO_MIGRATE' => '1',
]);
$command = [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', dirname(__DIR__) . '/public', dirname(__DIR__) . '/public/router.php'];
$process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', '/tmp/lavbe-api-http-test.log', 'a'], 2 => ['file', '/tmp/lavbe-api-http-test.log', 'a']], $pipes, dirname(__DIR__), $environment);
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
    $adminOpenApi = json_decode(file_get_contents(dirname(__DIR__, 3) . '/contracts/admin.openapi.json'), true, flags: JSON_THROW_ON_ERROR);
    $adminSessionSchema = $adminOpenApi['components']['schemas']['AdminSession'];
    $adminOrigin = ['Origin' => $origin, 'Content-Type' => 'application/json'];
    [$loginStatus, $loginHeaders, $login] = $send('/api/admin/v1/session', 'POST', $adminOrigin, json_encode(['username' => 'owner_test', 'password' => 'TestPassword!Asecure123', 'mfaCode' => $totp($admin['mfaSecret'], time())], JSON_THROW_ON_ERROR));
    if ($loginStatus !== 200 || ($loginHeaders['cache-control'] ?? '') !== 'no-store' || !str_contains($loginHeaders['set-cookie'] ?? '', 'Secure; HttpOnly; SameSite=Lax')) throw new RuntimeException('Admin MFA login or secure cookie failed.');
    $assertOpenApiKeys($login, $adminSessionSchema, 'Admin session response');
    preg_match('/lavbe_admin=([A-Za-z0-9_-]{43})/', $loginHeaders['set-cookie'] ?? '', $cookieMatch);
    if (!isset($cookieMatch[1])) throw new RuntimeException('Admin session cookie was missing.');
    $cookie = ['Cookie' => 'lavbe_admin=' . $cookieMatch[1]];
    [$sessionStatus, , $session] = $send('/api/admin/v1/session', 'GET', $cookie);
    if ($sessionStatus !== 200 || $session['userId'] !== $admin['userId'] || $session['role'] !== 'owner') throw new RuntimeException('Admin session restore failed.');
    [$csrfStatus] = $send('/api/admin/v1/session', 'DELETE', [...$adminOrigin, ...$cookie]);
    if ($csrfStatus !== 403) throw new RuntimeException('Admin logout accepted a missing CSRF token.');
    [$logoutStatus] = $send('/api/admin/v1/session', 'DELETE', [...$adminOrigin, ...$cookie, 'X-CSRF-Token' => $session['csrfToken']]);
    [$loggedOutStatus] = $send('/api/admin/v1/session', 'GET', $cookie);
    if ($logoutStatus !== 204 || $loggedOutStatus !== 401) throw new RuntimeException('Admin CSRF logout/session revocation failed.');
    $recoveryBody = json_encode(['username' => 'owner_test', 'password' => 'TestPassword!Asecure123', 'mfaCode' => $admin['recoveryCodes'][0]], JSON_THROW_ON_ERROR);
    [$recoveryStatus] = $send('/api/admin/v1/session', 'POST', $adminOrigin, $recoveryBody);
    preg_match('/lavbe_admin=([A-Za-z0-9_-]{43})/', $loginHeaders['set-cookie'] ?? '', $cookieMatch);
    $adminCookie = ['Cookie' => 'lavbe_admin=' . ($cookieMatch[1] ?? '')];
    [$freshLoginStatus, $freshLoginHeaders, $freshLogin] = $send('/api/admin/v1/session', 'POST', $adminOrigin, json_encode(['username' => 'owner_test', 'password' => 'TestPassword!Asecure123', 'mfaCode' => $totp($admin['mfaSecret'], time())], JSON_THROW_ON_ERROR));
    preg_match('/lavbe_admin=([A-Za-z0-9_-]{43})/', $freshLoginHeaders['set-cookie'] ?? '', $freshCookieMatch);
    if ($freshLoginStatus !== 200 || !isset($freshCookieMatch[1])) throw new RuntimeException('Admin could not reauthenticate for content workflow.');
    $adminCookie = ['Cookie' => 'lavbe_admin=' . $freshCookieMatch[1]];
    $englishCatalog = json_decode(file_get_contents(dirname(__DIR__, 3) . '/content/locales/en.json'), true, flags: JSON_THROW_ON_ERROR);
    $canonical = static function (mixed $value) use (&$canonical): string {
        if (is_array($value)) { if (array_is_list($value)) return '[' . implode(',', array_map($canonical, $value)) . ']'; ksort($value, SORT_STRING); $pairs=[]; foreach($value as $k=>$v) $pairs[]=json_encode((string)$k,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).':'.$canonical($v); return '{'.implode(',',$pairs).'}'; }
        return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    };
    $sourceMessage = $englishCatalog['messages']['spin'];
    $uiRecord = ['key'=>'spin','message'=>$sourceMessage,'sourceHash'=>hash('sha256',$sourceMessage),'status'=>'reviewed'];
    $import = ['kind'=>'ui-catalog','locale'=>'en','sourceHash'=>hash('sha256',$canonical($englishCatalog['messages'])),'records'=>[$uiRecord],'expectedRevision'=>0];
    $adminMutationHeaders = [...$adminOrigin,...$adminCookie,'X-CSRF-Token'=>$freshLogin['csrfToken']];
    [$importStatus, , $version] = $send('/api/admin/v1/imports','POST',$adminMutationHeaders,json_encode($import,JSON_THROW_ON_ERROR));
    if($importStatus!==201||($version['state']??null)!=='draft') throw new RuntimeException('Admin strict-schema import did not create a draft.');
    [$validateStatus, , $validation] = $send('/api/admin/v1/versions/'.$version['id'].'/validate','POST',$adminMutationHeaders,'{}');
    if($validateStatus!==200||($validation['valid']??false)!==true) throw new RuntimeException('Admin draft validation failed. '.json_encode($validation));
    [$reviewStatus, , $reviewed] = $send('/api/admin/v1/versions/'.$version['id'].'/review','POST',$adminMutationHeaders,json_encode(['expectedRevision'=>1,'note'=>'synthetic review'],JSON_THROW_ON_ERROR));
    if($reviewStatus!==200||($reviewed['state']??null)!=='reviewed') throw new RuntimeException('Admin content review transition failed.');
    [$staleReviewStatus] = $send('/api/admin/v1/versions/'.$version['id'].'/review','POST',$adminMutationHeaders,json_encode(['expectedRevision'=>1,'note'=>'duplicate review'],JSON_THROW_ON_ERROR));
    if($staleReviewStatus!==409) throw new RuntimeException('Admin review accepted a repeated stale revision.');
    $unsafeRecord = ['key'=>'spin','message'=>'<script>alert(1)</script>','sourceHash'=>hash('sha256',$sourceMessage),'status'=>'draft'];
    $unsafeImport = [...$import,'locale'=>'az','records'=>[$unsafeRecord],'expectedRevision'=>0];
    [$unsafeImportStatus, , $unsafeVersion] = $send('/api/admin/v1/imports','POST',$adminMutationHeaders,json_encode($unsafeImport,JSON_THROW_ON_ERROR));
    [$unsafeValidationStatus, , $unsafeValidation] = $send('/api/admin/v1/versions/'.$unsafeVersion['id'].'/validate','POST',$adminMutationHeaders,'{}');
    if($unsafeImportStatus!==201||$unsafeValidationStatus!==200||($unsafeValidation['valid']??true)!==false||!in_array('UNSAFE_MARKUP',array_column($unsafeValidation['errors'],'code'),true)) throw new RuntimeException('Admin validation accepted executable markup.');
    $staleRecord = ['key'=>'spin','message'=>$sourceMessage,'sourceHash'=>str_repeat('0',64),'status'=>'draft'];
    $staleImport = [...$import,'locale'=>'az','records'=>[$staleRecord],'expectedRevision'=>1];
    [$staleImportStatus, , $staleVersion] = $send('/api/admin/v1/imports','POST',$adminMutationHeaders,json_encode($staleImport,JSON_THROW_ON_ERROR));
    [$staleValidationStatus, , $staleValidation] = $send('/api/admin/v1/versions/'.$staleVersion['id'].'/validate','POST',$adminMutationHeaders,'{}');
    if($staleImportStatus!==201||$staleValidationStatus!==200||($staleValidation['valid']??true)!==false||!in_array('STALE_SOURCE',array_column($staleValidation['errors'],'code'),true)) throw new RuntimeException('Admin validation accepted stale source metadata.');
    [$versionsStatus, , $versions] = $send('/api/admin/v1/versions','GET',$adminCookie);
    if($versionsStatus!==200||count($versions)!==3||!in_array($version['id'],array_column($versions,'id'),true)) throw new RuntimeException('Admin content version listing failed.');
    $publishRequestFor = static function(string $versionId)use($send,$adminCookie):array{
        [$status,,$detail]=$send('/api/admin/v1/versions/'.$versionId,'GET',$adminCookie);
        if($status!==200)throw new RuntimeException('Reviewed content could not be loaded for publish digest calculation.');
        $versions=[['id'=>$detail['version']['id'],'revision'=>$detail['version']['revision'],'payload'=>$detail['payload']]];
        return ['versionIds'=>[$versionId],'manifestHash'=>\Lavbe\Api\Admin\CanonicalJson::hash($versions)];
    };
    $startPublish = static function(string $versionId)use($publishRequestFor,$send,$adminMutationHeaders,$adminOpenApi):array{
        $publishRequest=$publishRequestFor($versionId);
        [$status,$headers,$job]=$send('/api/admin/v1/publish-jobs','POST',$adminMutationHeaders,json_encode($publishRequest,JSON_THROW_ON_ERROR));
        if($status!==202||!isset($headers['x-runner-credential']))throw new RuntimeException('Publish job did not issue its scoped runner credential (status='.$status.', response='.json_encode($job).').');
        $assertKeys=$adminOpenApi['components']['schemas']['Job']['required'];$keys=array_keys($job);sort($keys);sort($assertKeys);if($keys!==$assertKeys)throw new RuntimeException('Publish job response differs from OpenAPI.');
        return [$job,$headers['x-runner-credential'],$publishRequest['manifestHash']];
    };
    $runStatus = static function(string $jobId,string $credential,string $state,?string $artifact=null,?string $error=null)use($send):array{
        return $send('/api/admin/v1/runner/jobs/'.$jobId.'/status','POST',['Authorization'=>'Bearer '.$credential,'Content-Type'=>'application/json'],json_encode(['state'=>$state,'artifactHash'=>$artifact,'errorCode'=>$error],JSON_THROW_ON_ERROR));
    };
    $badDigestRequest=$publishRequestFor($version['id']);$badDigestRequest['manifestHash']=str_repeat('0',64);
    [$badDigestStatus,,$badDigestError]=$send('/api/admin/v1/publish-jobs','POST',$adminMutationHeaders,json_encode($badDigestRequest,JSON_THROW_ON_ERROR));
    if($badDigestStatus!==409||($badDigestError['error']['code']??null)!=='REVISION_CONFLICT')throw new RuntimeException('Publish job accepted a mismatched manifest digest.');
    [$emptyPublicationStatus,,$emptyPublication]=$send('/api/admin/v1/publication','GET',$adminCookie);
    $assertOpenApiKeys($emptyPublication,$adminOpenApi['components']['schemas']['PublicationState'],'Empty publication state');
    if($emptyPublicationStatus!==200||$emptyPublication['active']!==null||$emptyPublication['knownGood']!==[])throw new RuntimeException('Empty publication state contract failed.');
    [$firstJob,$firstRunner,$firstHash]=$startPublish($version['id']);
    [$badRunnerStatus]=$send('/api/admin/v1/runner/jobs/'.$firstJob['id'].'/manifest','GET',['Authorization'=>'Bearer '.str_repeat('x',43)]);
    if($badRunnerStatus!==401)throw new RuntimeException('Runner accepted a credential outside its job scope.');
    [$firstManifestStatus,,$firstManifest]=$send('/api/admin/v1/runner/jobs/'.$firstJob['id'].'/manifest','GET',['Authorization'=>'Bearer '.$firstRunner]);
    $assertOpenApiKeys($firstManifest,$adminOpenApi['components']['schemas']['PublishManifest'],'Publish manifest response');
    $signatureEncoded=strtr($firstManifest['signature']??'','-_','+/');$signatureBytes=base64_decode($signatureEncoded.str_repeat('=',(4-strlen($signatureEncoded)%4)%4),true);
    $unsignedManifest=$firstManifest;unset($unsignedManifest['signature']);
    if(($firstManifest['signatureAlgorithm']??null)!=='Ed25519'||$signatureBytes===false||!sodium_crypto_sign_verify_detached($signatureBytes,\Lavbe\Api\Admin\CanonicalJson::encode($unsignedManifest),$manifestSigningPublic))throw new RuntimeException('Runner manifest signature verification failed.');
    $tamperedManifest=$unsignedManifest;$tamperedManifest['state']='building';
    if(sodium_crypto_sign_verify_detached($signatureBytes,\Lavbe\Api\Admin\CanonicalJson::encode($tamperedManifest),$manifestSigningPublic))throw new RuntimeException('Runner manifest signature did not detect envelope tampering.');
    $artifactA=str_repeat('b',64);
    [$invalidTransitionStatus]=$runStatus($firstJob['id'],$firstRunner,'succeeded',$artifactA);
    [$firstValidateStatus]= $runStatus($firstJob['id'],$firstRunner,'validating');
    [$firstBuildStatus]= $runStatus($firstJob['id'],$firstRunner,'building');
    [$awaitingStatus]= $runStatus($firstJob['id'],$firstRunner,'awaiting-promotion',$artifactA);
    [$badPromoteStatus]=$send('/api/admin/v1/publish-jobs/'.$firstJob['id'].'/promote','POST',$adminMutationHeaders,json_encode(['artifactHash'=>str_repeat('d',64)],JSON_THROW_ON_ERROR));
    [$promoteStatus,$promoteHeaders,$promoted]=$send('/api/admin/v1/publish-jobs/'.$firstJob['id'].'/promote','POST',$adminMutationHeaders,json_encode(['artifactHash'=>$artifactA],JSON_THROW_ON_ERROR));
    [$firstSuccessStatus,,$firstSucceeded]=$runStatus($firstJob['id'],$firstRunner,'succeeded',$artifactA);
    [$duplicateSuccessStatus,,$duplicateSuccess]=$runStatus($firstJob['id'],$firstRunner,'succeeded',$artifactA);
    if($firstManifestStatus!==200||$firstManifest['mode']!=='publish'||$firstManifest['manifestHash']!==$firstHash||$invalidTransitionStatus!==409||$firstValidateStatus!==200||$firstBuildStatus!==200||$awaitingStatus!==200||$badPromoteStatus!==409||$promoteStatus!==202||$firstSuccessStatus!==200||$firstSucceeded['state']!=='succeeded'||$duplicateSuccessStatus!==200||$duplicateSuccess['state']!=='succeeded')throw new RuntimeException('Reviewed content publication state machine or retry-safe success acknowledgment failed.');
    [$activePublicationStatus,,$activePublication]=$send('/api/admin/v1/publication','GET',$adminCookie);
    $assertOpenApiKeys($activePublication,$adminOpenApi['components']['schemas']['PublicationState'],'Active publication state');
    if($activePublicationStatus!==200||$activePublication['active']['jobId']!==$firstJob['id']||$activePublication['active']['artifactHash']!==$artifactA||count($activePublication['knownGood'])!==1)throw new RuntimeException('Active publication pointer or known-good artifact listing failed.');
    $secondImport=[...$import,'expectedRevision'=>1];
    [$secondImportStatus,,$secondVersion]=$send('/api/admin/v1/imports','POST',$adminMutationHeaders,json_encode($secondImport,JSON_THROW_ON_ERROR));
    [$secondValidateStatus,,$secondValidation]=$send('/api/admin/v1/versions/'.$secondVersion['id'].'/validate','POST',$adminMutationHeaders,'{}');
    [$secondReviewStatus,,$secondReviewed]=$send('/api/admin/v1/versions/'.$secondVersion['id'].'/review','POST',$adminMutationHeaders,json_encode(['expectedRevision'=>2,'note'=>'second source revision'],JSON_THROW_ON_ERROR));
    if($secondImportStatus!==201||$secondValidateStatus!==200||!$secondValidation['valid']||$secondReviewStatus!==200||$secondReviewed['state']!=='reviewed')throw new RuntimeException('Second reviewed content revision failed.');
    [$failedJob,$failedRunner]=$startPublish($secondVersion['id']);
    [$failedManifestStatus]=$send('/api/admin/v1/runner/jobs/'.$failedJob['id'].'/manifest','GET',['Authorization'=>'Bearer '.$failedRunner]);
    [$failedValidateStatus]=$runStatus($failedJob['id'],$failedRunner,'validating');
    [$failedBuildStatus]=$runStatus($failedJob['id'],$failedRunner,'building');
    [$failedStatus,,$failedJobResult]=$runStatus($failedJob['id'],$failedRunner,'failed',null,'BUILD_FAILED');
    $liveAfterFailure=$testPdo->query('SELECT LOWER(HEX(artifact_hash)) FROM active_publications WHERE singleton_id=1')->fetchColumn();
    if($failedManifestStatus!==200||$failedValidateStatus!==200||$failedBuildStatus!==200||$failedStatus!==200||$failedJobResult['state']!=='failed'||$liveAfterFailure!==$artifactA)throw new RuntimeException('Failed build changed the known-good active publication.');
    [$secondJob,$secondRunner]=$startPublish($secondVersion['id']);
    [$secondManifestStatus]=$send('/api/admin/v1/runner/jobs/'.$secondJob['id'].'/manifest','GET',['Authorization'=>'Bearer '.$secondRunner]);
    [$secondValidateState]=$runStatus($secondJob['id'],$secondRunner,'validating');
    [$secondBuildState]=$runStatus($secondJob['id'],$secondRunner,'building');
    $artifactB=str_repeat('c',64);
    [$secondAwaiting]=$runStatus($secondJob['id'],$secondRunner,'awaiting-promotion',$artifactB);
    [$secondPromote]=$send('/api/admin/v1/publish-jobs/'.$secondJob['id'].'/promote','POST',$adminMutationHeaders,json_encode(['artifactHash'=>$artifactB],JSON_THROW_ON_ERROR));
    [$secondSuccess,,$secondSucceeded]=$runStatus($secondJob['id'],$secondRunner,'succeeded',$artifactB);
    if($secondManifestStatus!==200||$secondValidateState!==200||$secondBuildState!==200||$secondAwaiting!==200||$secondPromote!==202||$secondSuccess!==200||$secondSucceeded['state']!=='succeeded')throw new RuntimeException('Second content publication failed.');
    [$unknownRollbackStatus]=$send('/api/admin/v1/publish-jobs/'.$secondJob['id'].'/rollback','POST',$adminMutationHeaders,json_encode(['targetArtifactHash'=>str_repeat('d',64)],JSON_THROW_ON_ERROR));
    if($unknownRollbackStatus!==409)throw new RuntimeException('Rollback accepted an artifact without known-good publication evidence.');
    [$rollbackStatus,$rollbackHeaders,$rollbackJob]=$send('/api/admin/v1/publish-jobs/'.$secondJob['id'].'/rollback','POST',$adminMutationHeaders,json_encode(['targetArtifactHash'=>$artifactA],JSON_THROW_ON_ERROR));
    if($rollbackStatus!==202||!isset($rollbackJob['id'],$rollbackHeaders['x-runner-credential']))throw new RuntimeException('Known-good rollback was not accepted (status='.$rollbackStatus.', response='.json_encode($rollbackJob).').');
    $rollbackRunner=$rollbackHeaders['x-runner-credential']??'';
    [$rollbackManifestStatus,,$rollbackManifest]=$send('/api/admin/v1/runner/jobs/'.$rollbackJob['id'].'/manifest','GET',['Authorization'=>'Bearer '.$rollbackRunner]);
    [$rollbackSuccess,,$rolledBack]=$runStatus($rollbackJob['id'],$rollbackRunner,'succeeded',$artifactA);
    $activeAfterRollback=$testPdo->query('SELECT job_id,LOWER(HEX(artifact_hash)) artifact FROM active_publications WHERE singleton_id=1')->fetch();
    [$rolledBackJobStatus,,$rolledBackJob]=$send('/api/admin/v1/publish-jobs/'.$secondJob['id'],'GET',$adminCookie);
    if($rollbackStatus!==202||$rollbackManifestStatus!==200||$rollbackManifest['mode']!=='rollback'||$rollbackManifest['rollbackArtifactHash']!==$artifactA||$rollbackSuccess!==200||$rolledBack['state']!=='succeeded'||$activeAfterRollback['job_id']!==$rollbackJob['id']||$activeAfterRollback['artifact']!==$artifactA||$rolledBackJobStatus!==200||$rolledBackJob['state']!=='rolled-back')throw new RuntimeException('Known-good publication rollback failed.');
    $syntheticJobIds=[];$insertJob=$testPdo->prepare("INSERT INTO publish_jobs(id,job_type,state,manifest_hash,actor_id,created_at,updated_at) VALUES (:id,'publish','failed',:manifest,:actor,'2099-01-01 00:00:00.000000','2099-01-01 00:00:00.000000')");
    for($i=0;$i<51;$i++){$id=bin2hex(random_bytes(16));$syntheticJobIds[]=$id;$insertJob->execute(['id'=>$id,'manifest'=>str_repeat('m',32),'actor'=>$admin['userId']]);}
    [$jobsFirstStatus,$jobsFirstHeaders,$jobsFirst]=$send('/api/admin/v1/publish-jobs','GET',$adminCookie);
    if($jobsFirstStatus!==200||count($jobsFirst)!==50||!isset($jobsFirstHeaders['x-next-cursor']))throw new RuntimeException('Publish-job first page did not return exactly 50 rows and a continuation cursor.');
    foreach($jobsFirst as $job){$assertOpenApiKeys($job,$adminOpenApi['components']['schemas']['Job'],'Publish-job list item');if(array_key_exists('runnerCredential',$job))throw new RuntimeException('Publish-job list exposed a runner credential.');}
    [$jobsSecondStatus,$jobsSecondHeaders,$jobsSecond]=$send('/api/admin/v1/publish-jobs?cursor='.rawurlencode($jobsFirstHeaders['x-next-cursor']),'GET',$adminCookie);
    $pagedJobIds=array_column($jobsFirst,'id');foreach($jobsSecond as $job)$pagedJobIds[]=$job['id'];
    if($jobsSecondStatus!==200||count($jobsSecond)!==5||isset($jobsSecondHeaders['x-next-cursor'])||count(array_intersect($syntheticJobIds,$pagedJobIds))!==51)throw new RuntimeException('Publish-job cursor pagination lost, repeated or mis-sized rows.');
    [$invalidJobsCursorStatus]=$send('/api/admin/v1/publish-jobs?cursor=not-a-valid-cursor','GET',$adminCookie);
    if($invalidJobsCursorStatus!==400)throw new RuntimeException('Publish-job endpoint accepted a malformed cursor.');
    [$auditStatus, , $auditEvents] = $send('/api/admin/v1/audit','GET',$adminCookie);
    if($auditStatus!==200||!is_array($auditEvents)||count($auditEvents)<4) throw new RuntimeException('Owner audit-event list failed.');
    foreach($auditEvents as $event){$keys=array_keys($event);sort($keys);if($keys!==['action','actorId','at','id','objectId'])throw new RuntimeException('Audit event response differs from OpenAPI.');}
    [$lastOwnerStatus] = $send('/api/admin/v1/users/'.$admin['userId'],'PUT',$adminMutationHeaders,json_encode(['username'=>'owner_test','role'=>'editor','disabled'=>false],JSON_THROW_ON_ERROR));
    if($lastOwnerStatus!==409) throw new RuntimeException('The last active owner could be demoted.');
    $adminShareHeaders=['Origin'=>$origin,'Content-Type'=>'application/json','Idempotency-Key'=>'c7f54375-6d33-4f41-a70d-9611c1b1b9c5'];
    [$adminShareCreateStatus, , $adminShare] = $send('/api/v1/shares','POST',$adminShareHeaders,$payload);
    [$shareAdminStatus] = $send('/api/admin/v1/shares/'.$adminShare['shareId'].'/revoke','POST',$adminMutationHeaders,json_encode(['reasonCode'=>'abuse'],JSON_THROW_ON_ERROR));
    [$adminShareGoneStatus] = $send('/api/v1/shares/'.$adminShare['shareId']);
    if($adminShareCreateStatus!==201||$shareAdminStatus!==204||$adminShareGoneStatus!==410) throw new RuntimeException('Owner administrative revocation did not disable the public share.');
    [$userUpdateStatus, , $userUpdate] = $send('/api/admin/v1/users/'.$admin['userId'],'PUT',$adminMutationHeaders,json_encode(['username'=>'owner_test','role'=>'owner','disabled'=>false],JSON_THROW_ON_ERROR));
    $assertOpenApiKeys($userUpdate,$adminOpenApi['components']['schemas']['OwnerUser'],'Owner user response');
    [$updatedUserSessionStatus] = $send('/api/admin/v1/session','GET',$adminCookie);
    if($userUpdateStatus!==200||($userUpdate['role']??null)!=='owner'||$updatedUserSessionStatus!==401) throw new RuntimeException('Owner update did not revoke sessions safely.');
    [$editorLoginStatus,$editorHeaders,$editorSession] = $send('/api/admin/v1/session','POST',$adminOrigin,json_encode(['username'=>'editor_test','password'=>'TestEditorPassword!Secure123','mfaCode'=>$totp($editor['mfaSecret'],time())],JSON_THROW_ON_ERROR));
    preg_match('/lavbe_admin=([A-Za-z0-9_-]{43})/',$editorHeaders['set-cookie']??'',$editorCookieMatch);
    if($editorLoginStatus!==200||($editorSession['role']??null)!=='editor'||!isset($editorCookieMatch[1])) throw new RuntimeException('Provisioned editor MFA login failed.');
    $editorCookie=['Cookie'=>'lavbe_admin='.$editorCookieMatch[1]];
    [$ownerOnlyStatus]= $send('/api/admin/v1/audit','GET',$editorCookie);
    if($ownerOnlyStatus!==403) throw new RuntimeException('Editor accessed the owner-only audit endpoint.');
    [$reusedRecoveryStatus, , $reusedRecoveryError] = $send('/api/admin/v1/session', 'POST', $adminOrigin, $recoveryBody);
    if ($recoveryStatus !== 200 || $reusedRecoveryStatus !== 401 || ($reusedRecoveryError['error']['code'] ?? '') !== 'AUTHENTICATION_REQUIRED') {
        throw new RuntimeException('One-time admin recovery code did not enforce single use (first=' . $recoveryStatus . ', replay=' . $reusedRecoveryStatus . ', replayCode=' . ($reusedRecoveryError['error']['code'] ?? 'none') . ').');
    }
    fwrite(STDOUT, "PASS: live HTTP sharing, admin MFA/content review, signed publication failure/promotion/rollback, 50-row job pagination, role-gated owner operations and share revocation.\n");
} finally {
    proc_terminate($process);
    proc_close($process);
}
