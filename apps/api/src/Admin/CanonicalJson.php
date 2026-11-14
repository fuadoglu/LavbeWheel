<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

/** RFC 8785 serialization for the bounded JSON data types admitted by admin schemas. */
final class CanonicalJson
{
    public static function encode(mixed $value): string
    {
        if($value===null||is_bool($value)||is_string($value))return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        if(is_int($value)){
            if(abs($value)>9007199254740991)throw new \InvalidArgumentException('Canonical JSON integer exceeds the interoperable range.');
            return (string)$value;
        }
        if(is_float($value))return self::number($value);
        if(!is_array($value))throw new \InvalidArgumentException('Canonical JSON accepts only JSON values.');
        if(array_is_list($value))return '['.implode(',',array_map(self::encode(...),$value)).']';
        $keys=array_keys($value);
        foreach($keys as $key)if(!is_string($key))throw new \InvalidArgumentException('Canonical JSON object keys must be strings.');
        usort($keys,static fn(string $a,string $b):int=>strcmp(mb_convert_encoding($a,'UTF-16BE','UTF-8'),mb_convert_encoding($b,'UTF-16BE','UTF-8')));
        $members=[];
        foreach($keys as $key)$members[]=json_encode($key,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).':'.self::encode($value[$key]);
        return '{'.implode(',',$members).'}';
    }

    public static function hash(mixed $value):string{return hash('sha256',self::encode($value));}

    private static function number(float $value):string
    {
        if(!is_finite($value))throw new \InvalidArgumentException('Canonical JSON forbids non-finite numbers.');
        if($value==0.0)return '0';
        $raw=json_encode($value,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
        if(!str_contains(strtolower($raw),'e'))return str_ends_with($raw,'.0')?substr($raw,0,-2):$raw;
        [$mantissa,$exponent]=preg_split('/e/i',$raw);$exponent=(int)$exponent;
        $sign='';if(str_starts_with($mantissa,'-')){$sign='-';$mantissa=substr($mantissa,1);}
        $digits=rtrim(str_replace('.','',$mantissa),'0');$decimal=strpos($mantissa,'.');$decimal=$decimal===false?strlen($mantissa):$decimal;
        $point=$decimal+$exponent;
        if($value>=1e-6&&$value<1e21){
            if($point<=0)return $sign.'0.'.str_repeat('0',-$point).$digits;
            if($point>=strlen($digits))return $sign.$digits.str_repeat('0',$point-strlen($digits));
            return $sign.substr($digits,0,$point).'.'.substr($digits,$point);
        }
        $digits=rtrim($digits,'0');
        $first=substr($digits,0,1);$fraction=substr($digits,1);
        $normalized=$first.($fraction!==''?'.'.$fraction:'');
        $scientificExponent=$point-1;
        return $sign.$normalized.'e'.($scientificExponent>=0?'+':'').$scientificExponent;
    }
}
