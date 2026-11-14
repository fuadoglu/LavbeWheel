<?php

declare(strict_types=1);

use Lavbe\Api\Domain\WheelSemanticValidator;

require_once dirname(__DIR__) . '/vendor/autoload.php';
$root = dirname(__DIR__, 3);
$vectors = json_decode(file_get_contents($root . '/contracts/semantic-vectors.json'), true, flags: JSON_THROW_ON_ERROR);
$validator = new WheelSemanticValidator();
foreach ($vectors as $vector) {
    $actual = $validator->validate($vector['wheel']);
    if ($actual !== $vector['expected']) {
        fwrite(STDERR, sprintf("FAIL: %s expected %s, got %s\n", $vector['id'], $vector['expected'], $actual));
        exit(1);
    }
}
if (class_exists(Normalizer::class)) {
    $wheel = $vectors[0]['wheel'];
    $wheel['title'] = "Cafe\u{0301}";
    $wheel['entries'][0]['label'] = "A\u{030A}";
    $wheel['entries'][1]['label'] = 'Å';
    $normalized = $validator->normalizeForStorage($wheel);
    if ($normalized['title'] !== 'Café' || $normalized['entries'][0]['label'] !== 'Å'
        || $normalized['entries'][1]['label'] !== 'Å' || $normalized['entries'][0]['id'] === $normalized['entries'][1]['id']) {
        fwrite(STDERR, "FAIL: NFC normalization changed identity or did not normalize text.\n");
        exit(1);
    }
}
printf("PASS: PHP semantic validator matched %d shared golden vectors.\n", count($vectors));
