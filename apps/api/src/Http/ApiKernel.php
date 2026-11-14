<?php

declare(strict_types=1);

namespace Lavbe\Api\Http;

use Lavbe\Api\Application\ShareService;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Limits;

final class ApiKernel
{
    public function __construct(private readonly Config $config, private readonly ShareService $shares) {}

    public function handle(Request $request, ?int $now = null): Response
    {
        $now ??= time();
        $requestId = bin2hex(random_bytes(16));
        $headers = ['Cache-Control' => 'no-store, private', 'Pragma' => 'no-cache', 'X-Content-Type-Options' => 'nosniff', 'X-Request-Id' => $requestId, 'Referrer-Policy' => 'no-referrer'];
        try {
            $maxBodyBytes = Limits::sharing()['maxBodyBytes'];
            if ($request->contentLength > $maxBodyBytes || strlen($request->body) > $maxBodyBytes) {
                throw new ApiException(413, 'BODY_TOO_LARGE', 'The request body is too large.');
            }
            $network = $this->networkKey($request);
            if ($request->method === 'GET' && $request->path === '/api/v1/health') {
                return new Response(200, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], ['status' => 'ok']);
            }
            if ($request->method === 'POST' && $request->path === '/api/v1/shares') {
                $this->requireOrigin($request);
                $key = $request->header('idempotency-key');
                if ($key === null || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $key)) {
                    throw new ApiException(400, 'VALIDATION_ERROR', 'A valid idempotency key is required.');
                }
                $payload = json_decode($request->body, true, flags: JSON_THROW_ON_ERROR);
                if (!is_array($payload)) {
                    throw new ApiException(400, 'VALIDATION_ERROR', 'The request body is invalid.');
                }
                $created = $this->shares->create($payload, strtolower($key), $network, $now);
                return new Response(201, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], $created);
            }
            if (preg_match('#^/api/v1/shares/([^/]+)$#', $request->path, $match)) {
                $id = $match[1];
                if (!preg_match('/^[A-Za-z0-9_-]{32}$/', $id)) {
                    throw new ApiException(400, 'VALIDATION_ERROR', 'The share identifier is invalid.');
                }
                if ($request->method === 'GET') {
                    $shared = $this->shares->read($id, $network, $now);
                    return new Response(200, [...$headers, 'Content-Type' => 'application/json; charset=utf-8', 'X-Robots-Tag' => 'noindex, nofollow, noarchive'], $shared);
                }
                if ($request->method === 'DELETE') {
                    $this->requireOrigin($request);
                    $authorization = $request->header('authorization');
                    if ($authorization === null || !preg_match('/^Bearer ([A-Za-z0-9_-]{43})$/', $authorization, $token)) {
                        throw new ApiException(401, 'INVALID_CAPABILITY', 'The share capability is invalid.');
                    }
                    $this->shares->revoke($id, $token[1], $network, $now);
                    return new Response(204, $headers);
                }
            }
            throw new ApiException(404, 'NOT_FOUND', 'The requested resource could not be found.');
        } catch (ApiException $error) {
            if ($error->retryAfter !== null) {
                $headers['Retry-After'] = (string) $error->retryAfter;
            }
            return new Response($error->status, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], [
                'error' => ['code' => $error->errorCode, 'message' => $error->getMessage()], 'requestId' => $requestId,
            ]);
        } catch (\JsonException) {
            return new Response(400, [...$headers, 'Content-Type' => 'application/json; charset=utf-8'], ['error' => ['code' => 'VALIDATION_ERROR', 'message' => 'The request body is invalid.'], 'requestId' => $requestId]);
        } catch (\Throwable) {
            return new Response(503, [...$headers, 'Content-Type' => 'application/json; charset=utf-8', 'Retry-After' => '30'], ['error' => ['code' => 'SERVICE_UNAVAILABLE', 'message' => 'The service is temporarily unavailable.'], 'requestId' => $requestId]);
        }
    }

    private function requireOrigin(Request $request): void
    {
        $origin = $request->header('origin');
        if ($origin === null || !hash_equals($this->config->appOrigin, $origin)) {
            throw new ApiException(403, 'UNSUPPORTED_ORIGIN', 'This request origin is not allowed.');
        }
    }

    private function networkKey(Request $request): string
    {
        $address = $request->remoteAddress;
        if (in_array($address, $this->config->trustedProxies, true)) {
            $forwarded = $request->header('x-forwarded-for');
            if ($forwarded !== null && filter_var(trim(explode(',', $forwarded)[0]), FILTER_VALIDATE_IP)) {
                $address = trim(explode(',', $forwarded)[0]);
            }
        }
        if (!filter_var($address, FILTER_VALIDATE_IP)) {
            throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.', 30);
        }
        $packed = inet_pton($address);
        if ($packed === false) {
            throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.', 30);
        }
        $prefixBytes = strlen($packed) === 4 ? 3 : 7;
        return substr($packed, 0, $prefixBytes) . str_repeat("\0", strlen($packed) - $prefixBytes);
    }
}
