<?php

declare(strict_types=1);

use Lavbe\Api\Domain\WheelRequestValidator;
use Lavbe\Api\Domain\WheelSemanticValidator;
use Lavbe\Api\Http\ApiException;

require_once dirname(__DIR__) . '/vendor/autoload.php';
$validator = new WheelRequestValidator(new WheelSemanticValidator());
$fixture = json_decode(file_get_contents(dirname(__DIR__, 3) . '/contracts/examples/wheel.json'), true, flags: JSON_THROW_ON_ERROR);
$accepted = $validator->validateCreate(['wheel' => $fixture, 'ttlDays' => 30]);
if (count($accepted['wheel']['entries']) !== 3 || $accepted['ttlDays'] !== 30) {
    throw new RuntimeException('Valid example wheel was not accepted.');
}
$inactive = $fixture;
$inactive['entries'][2]['active'] = false;
if (count($validator->validateCreate(['wheel' => $inactive, 'ttlDays' => 7])['wheel']['entries']) !== 2) {
    throw new RuntimeException('Inactive entries were retained in the immutable share.');
}
$invalid = $fixture;
$invalid['unexpected'] = true;
$rejected = false;
try {
    $validator->validateCreate(['wheel' => $invalid, 'ttlDays' => 30]);
} catch (ApiException $error) {
    $rejected = $error->status === 400;
}
if (!$rejected) {
    throw new RuntimeException('Unknown wheel property was accepted.');
}
$yesNo = $fixture;
$yesNo['tool'] = 'yes-no';
$yesNo['entries'] = array_slice($yesNo['entries'], 0, 2);
$yesNo['entries'][1]['active'] = false;
$rejected = false;
try {
    $validator->validateCreate(['wheel' => $yesNo, 'ttlDays' => 30]);
} catch (ApiException $error) {
    $rejected = $error->status === 400;
}
if (!$rejected) throw new RuntimeException('Invalid yes/no options were accepted.');
$numbers = $fixture;
$numbers['tool'] = 'numbers';
$numbers['entries'] = [];
$numbers['range'] = ['min' => -2, 'max' => 2];
$validator->validateCreate(['wheel' => $numbers, 'ttlDays' => 30]);
$numbers['entries'] = [$fixture['entries'][0]];
$rejected = false;
try {
    $validator->validateCreate(['wheel' => $numbers, 'ttlDays' => 30]);
} catch (ApiException $error) {
    $rejected = $error->status === 400;
}
if (!$rejected) throw new RuntimeException('Number wheel accepted named entries.');
fwrite(STDOUT, "PASS: API request allowlist accepts valid wheels, strips inactive entries, rejects unknown fields.\n");
