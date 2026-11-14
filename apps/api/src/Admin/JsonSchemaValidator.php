<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use Opis\JsonSchema\CompliantValidator;
use Opis\JsonSchema\Helper;

final class JsonSchemaValidator
{
    private readonly CompliantValidator $validator;

    public function __construct(private readonly string $contractRoot)
    {
        $this->validator = new CompliantValidator();
        foreach (glob($contractRoot . '/*.schema.json') ?: [] as $path) {
            $schema = json_decode((string) file_get_contents($path), false, flags: JSON_THROW_ON_ERROR);
            if (isset($schema->{'$id'})) $this->validator->resolver()->registerFile($schema->{'$id'}, $path);
        }
    }

    public function assertValid(array $data, string $schemaFile): void
    {
        $path = $this->contractRoot . '/' . $schemaFile;
        if (!is_file($path)) throw new \RuntimeException('The requested content contract is unavailable.');
        $schema = json_decode((string) file_get_contents($path), false, flags: JSON_THROW_ON_ERROR);
        $this->assertAgainst($data, $schema);
    }

    public function assertAgainst(array $data, object $schema): void
    {
        $result = $this->validator->validate(Helper::toJSON($data), $schema);
        if (!$result->isValid()) {
            throw new \InvalidArgumentException('The content record does not match its approved schema.');
        }
    }
}
