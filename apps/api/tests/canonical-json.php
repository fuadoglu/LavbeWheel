<?php

declare(strict_types=1);

use Lavbe\Api\Admin\CanonicalJson;

require_once dirname(__DIR__) . '/vendor/autoload.php';
$vectors=json_decode((string)file_get_contents(dirname(__DIR__,3).'/contracts/canonical-json-vectors.json'),true,flags:JSON_THROW_ON_ERROR);
foreach($vectors['vectors'] as $vector){$value=json_decode($vector['input'],true,flags:JSON_THROW_ON_ERROR);if(CanonicalJson::encode($value)!==$vector['canonical'])throw new RuntimeException('Canonical JSON vector failed: '.$vector['name'].'. '.CanonicalJson::encode($value));}
$numbers=[
    ['0000000000000000','0'],['8000000000000000','0'],['0000000000000001','5e-324'],
['44b52d02c7e14af6','1e+23'],['3eb0c6f7a0b5ed8c','9.999999999999997e-7'],
    ['3eb0c6f7a0b5ed8d','0.000001'],['7fefffffffffffff','1.7976931348623157e+308'],
];
foreach($numbers as [$hex,$expectedNumber]){$value=unpack('Evalue',hex2bin($hex))['value'];if(CanonicalJson::encode($value)!==$expectedNumber)throw new RuntimeException('RFC 8785 IEEE-754 sample mismatch for '.$hex.': '.CanonicalJson::encode($value));}
fwrite(STDOUT,"PASS: PHP canonical JSON matches RFC 8785 sample, UTF-16 key ordering and IEEE-754 edge vectors.\n");
