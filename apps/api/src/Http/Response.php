<?php

declare(strict_types=1);

namespace Lavbe\Api\Http;

final class Response
{
    public function __construct(public readonly int $status, public readonly array $headers = [], public readonly ?array $body = null) {}

    public function emit(): never
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }
        if ($this->body !== null) {
            echo json_encode($this->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        exit;
    }
}
