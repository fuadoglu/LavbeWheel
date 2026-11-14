<?php

declare(strict_types=1);

use Lavbe\Api\Admin\JsonSchemaValidator;

require_once dirname(__DIR__) . '/vendor/autoload.php';
$root = dirname(__DIR__, 3);
$validator = new JsonSchemaValidator($root . '/contracts');
foreach (['integration', 'legal', 'pack', 'preset', 'seo-copy', 'ui-catalog'] as $kind) {
    $record = json_decode(file_get_contents($root . '/contracts/examples/admin-' . $kind . '.json'), true, flags: JSON_THROW_ON_ERROR);
    $validator->assertValid($record, 'admin-' . $kind . '.schema.json');
    $invalid = $record;
    $invalid['unapprovedField'] = true;
    try {
        $validator->assertValid($invalid, 'admin-' . $kind . '.schema.json');
        throw new RuntimeException('The ' . $kind . ' schema accepted an unknown property.');
    } catch (InvalidArgumentException) {
    }
}
$pack = json_decode(file_get_contents($root . '/contracts/examples/admin-pack.json'), true, flags: JSON_THROW_ON_ERROR);
$pack['review'] = ['status' => 'reviewed', 'sourceHash' => str_repeat('a', 64)];
try {
    $validator->assertValid($pack, 'admin-pack.schema.json');
    throw new RuntimeException('The pack schema accepted reviewed content without reviewer evidence.');
} catch (InvalidArgumentException) {
}
fwrite(STDOUT, "PASS: PHP admin JSON Schema validator covers six strict record schemas and review-state constraints.\n");
