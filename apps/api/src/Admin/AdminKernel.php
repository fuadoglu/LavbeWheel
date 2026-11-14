<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Http\Request;
use Lavbe\Api\Http\Response;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Limits;

final class AdminKernel
{
    public function __construct(private readonly Config $config, private readonly AdminAuthService $auth, private readonly ContentService $content, private readonly AdminOperationsService $operations) {}

    public function handle(Request $request, ?int $now = null): ?Response
    {
        if (!str_starts_with($request->path, '/api/admin/v1/')) return null;
        $now ??= time();
        $requestId = bin2hex(random_bytes(16));
        $headers = ['Cache-Control' => 'no-store', 'Pragma' => 'no-cache', 'X-Content-Type-Options' => 'nosniff', 'X-Request-Id' => $requestId];
        try {
            $maxBodyBytes = $request->path === '/api/admin/v1/imports' ? Limits::content()['maxImportBytes'] : 8192;
            if ($request->contentLength > $maxBodyBytes || strlen($request->body) > $maxBodyBytes) {
                throw new ApiException(413, 'BODY_TOO_LARGE', 'The request body is too large.');
            }
            if ($request->path === '/api/admin/v1/session' && $request->method === 'POST') {
                $this->requireOrigin($request);
                $payload = json_decode($request->body, true, flags: JSON_THROW_ON_ERROR);
                if (!is_array($payload) || array_diff(array_keys($payload), ['username', 'password', 'mfaCode']) !== []
                    || array_diff(['username', 'password', 'mfaCode'], array_keys($payload)) !== []
                    || !is_string($payload['username']) || strlen($payload['username']) < 1 || strlen($payload['username']) > 200
                    || !is_string($payload['password']) || strlen($payload['password']) < 1 || strlen($payload['password']) > 1024
                    || !is_string($payload['mfaCode']) || !preg_match('/^(?:[0-9]{6}|[A-F0-9]{12})$/', $payload['mfaCode'])) {
                    throw new ApiException(400, 'VALIDATION_ERROR', 'The sign-in request is invalid.');
                }
                $identity = $this->networkKey($request);
                $session = $this->auth->login($payload['username'], $payload['password'], $payload['mfaCode'], $identity, $now);
                return new Response(200, [...$headers, 'Content-Type' => 'application/json; charset=utf-8', 'Set-Cookie' => $this->sessionCookie($session['sessionToken']),
                    'Cache-Control' => 'no-store'], ['userId' => $session['userId'], 'role' => $session['role'], 'csrfToken' => $session['csrfToken'], 'expiresAt' => $session['expiresAt']]);
            }
            if ($request->path === '/api/admin/v1/session' && $request->method === 'GET') {
                $session = $this->auth->session($this->sessionCookieValue($request), $now);
                return new Response(200, [...$headers, 'Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store'], [
                    'userId' => $session['userId'], 'role' => $session['role'], 'csrfToken' => $session['csrfToken'], 'expiresAt' => $session['expiresAt'],
                ]);
            }
            if ($request->path === '/api/admin/v1/session' && $request->method === 'DELETE') {
                $this->requireOrigin($request);
                $token = $this->sessionCookieValue($request);
                $session = $this->auth->session($token, $now);
                $this->auth->assertCsrf($session, $request->header('x-csrf-token'));
                $this->auth->logout($token);
                return new Response(204, [...$headers, 'Set-Cookie' => 'lavbe_admin=; Path=/api/admin/v1; Secure; HttpOnly; SameSite=Lax; Max-Age=0']);
            }
            if ($request->path === '/api/admin/v1/session' && $request->method === 'GET') { /* handled above */ }
            if (str_starts_with($request->path, '/api/admin/v1/')) {
                $isMutation = !in_array($request->method, ['GET', 'HEAD'], true);
                if ($isMutation) $this->requireOrigin($request);
                $session = $this->auth->session($this->sessionCookieValue($request), $now);
                if ($isMutation) $this->auth->assertCsrf($session, $request->header('x-csrf-token'));
                $path = $request->path;
                $payload = $request->body === '' ? [] : json_decode($request->body, true, flags: JSON_THROW_ON_ERROR);
                if (!is_array($payload)) throw new ApiException(400, 'VALIDATION_ERROR', 'The request body is invalid.');
                if ($path === '/api/admin/v1/versions' && $request->method === 'GET') {
                    $this->requireRole($session, ['owner','editor','reviewer','publisher']);
                    $cursor = $request->query['cursor'] ?? null;
                    if ($cursor !== null && !is_string($cursor)) throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');
                    $result=$this->content->list($cursor);
                    if($result['nextCursor']!==null)$headers['X-Next-Cursor']=$result['nextCursor'];
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$result['items']);
                }
                if ($path === '/api/admin/v1/imports' && $request->method === 'POST') {
                    $this->requireRole($session,['owner','editor']);
                    return new Response(201,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$this->content->import($payload,$session['userId']));
                }
                if (preg_match('#^/api/admin/v1/versions/([A-Za-z0-9_-]{8,64})$#',$path,$m) && $request->method==='GET') {
                    $this->requireRole($session,['owner','editor','reviewer','publisher']);
                    $result=$this->content->get($m[1]);
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],['version'=>$result['version'],'payload'=>$result['payload']]);
                }
                if (preg_match('#^/api/admin/v1/versions/([A-Za-z0-9_-]{8,64})/validate$#',$path,$m) && $request->method==='POST') {
                    $this->requireRole($session,['owner','editor','reviewer']);
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$this->content->validate($m[1],$session['userId']));
                }
                if (preg_match('#^/api/admin/v1/versions/([A-Za-z0-9_-]{8,64})/review$#',$path,$m) && $request->method==='POST') {
                    $this->requireRole($session,['owner','reviewer']);
                    if(!isset($payload['expectedRevision'],$payload['note'])||!is_int($payload['expectedRevision'])||!is_string($payload['note'])||strlen($payload['note'])>500||array_diff(array_keys($payload),['expectedRevision','note'])!==[]) throw new ApiException(400,'VALIDATION_ERROR','The review request is invalid.');
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$this->content->review($m[1],$payload['expectedRevision'],$session['userId'],$payload['note']));
                }
                if ($path === '/api/admin/v1/audit' && $request->method === 'GET') {
                    $this->requireRole($session,['owner']);
                    $cursor=$request->query['cursor']??null;
                    if($cursor!==null&&!is_string($cursor))throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');
                    $result=$this->operations->audit($cursor);
                    if($result['nextCursor']!==null)$headers['X-Next-Cursor']=$result['nextCursor'];
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$result['items']);
                }
                if(preg_match('#^/api/admin/v1/users/([A-Za-z0-9_-]{8,64})$#',$path,$m)&&$request->method==='PUT'){
                    $this->requireRole($session,['owner']);
                    return new Response(200,[...$headers,'Content-Type'=>'application/json; charset=utf-8'],$this->operations->updateUser($m[1],$payload,$session['userId']));
                }
                if(preg_match('#^/api/admin/v1/shares/([A-Za-z0-9_-]{20,64})/revoke$#',$path,$m)&&$request->method==='POST'){
                    $this->requireRole($session,['owner']);
                    if(array_diff(array_keys($payload),['reasonCode'])!==[]||!isset($payload['reasonCode'])||!is_string($payload['reasonCode']))throw new ApiException(400,'VALIDATION_ERROR','The revocation request is invalid.');
                    $this->operations->revokeShare($m[1],$payload['reasonCode'],$session['userId'],$now);
                    return new Response(204,$headers);
                }
            }
            throw new ApiException(404, 'NOT_FOUND', 'The requested resource could not be found.');
        } catch (ApiException $error) {
            if ($error->retryAfter !== null) $headers['Retry-After'] = (string) $error->retryAfter;
            return new Response($error->status, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], [
                'error' => ['code' => $error->errorCode, 'message' => $error->getMessage()], 'requestId' => $requestId,
            ]);
        } catch (\JsonException|\InvalidArgumentException) {
            return new Response(400, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], [
                'error' => ['code' => 'VALIDATION_ERROR', 'message' => 'The request body is invalid.'], 'requestId' => $requestId,
            ]);
        } catch (\Throwable) {
            return new Response(503, [...$headers, 'Content-Type' => 'application/json; charset=utf-8', 'Retry-After' => '30'], [
                'error' => ['code' => 'SERVICE_UNAVAILABLE', 'message' => 'The service is temporarily unavailable.'], 'requestId' => $requestId,
            ]);
        }
    }

    private function requireRole(array $session, array $roles): void
    {
        if ($session['role'] === 'owner') return;
        if (!in_array($session['role'], $roles, true)) throw new ApiException(403,'ACCESS_DENIED','This role cannot perform the requested action.');
    }

    private function requireOrigin(Request $request): void
    {
        if ($request->header('origin') === null || !hash_equals($this->config->appOrigin, $request->header('origin'))) {
            throw new ApiException(403, 'UNSUPPORTED_ORIGIN', 'This request origin is not allowed.');
        }
    }

    private function sessionCookieValue(Request $request): string
    {
        $cookie = $request->header('cookie') ?? '';
        foreach (explode(';', $cookie) as $pair) {
            [$name, $value] = array_pad(explode('=', trim($pair), 2), 2, '');
            if ($name === 'lavbe_admin' && preg_match('/^[A-Za-z0-9_-]{43}$/', $value)) return $value;
        }
        throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    }

    private function sessionCookie(string $token): string
    {
        return 'lavbe_admin=' . $token . '; Path=/api/admin/v1; Secure; HttpOnly; SameSite=Lax; Max-Age=43200';
    }

    private function networkKey(Request $request): string
    {
        $address = $request->remoteAddress;
        if (in_array($address, $this->config->trustedProxies, true)) {
            $forwarded = $request->header('x-forwarded-for');
            $candidate = $forwarded === null ? '' : trim(explode(',', $forwarded)[0]);
            if (filter_var($candidate, FILTER_VALIDATE_IP)) $address = $candidate;
        }
        $packed = filter_var($address, FILTER_VALIDATE_IP) ? inet_pton($address) : false;
        if ($packed === false) throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.', 30);
        $prefixBytes = strlen($packed) === 4 ? 3 : 7;
        return substr($packed, 0, $prefixBytes) . str_repeat("\0", strlen($packed) - $prefixBytes);
    }
}
