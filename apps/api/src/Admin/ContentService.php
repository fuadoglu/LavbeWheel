<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use PDO;
use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Crypto;

/** Encrypted, immutable admin content revisions. Imported review claims are never authoritative. */
final class ContentService
{
    public function __construct(private readonly PDO $pdo, private readonly Crypto $crypto, private readonly JsonSchemaValidator $schemas) {}

    public function import(array $input, string $actor): array
    {
        $this->validateDraftImport($input);
        $scope = $input['kind'] . ':' . $input['locale'];
        $this->pdo->beginTransaction();
        try {
            $q = $this->pdo->prepare('SELECT COALESCE(MAX(revision),0) FROM content_versions WHERE kind=:kind AND locale=:locale FOR UPDATE');
            $q->execute(['kind' => $input['kind'], 'locale' => $input['locale']]);
            $revision = (int) $q->fetchColumn();
            if ($revision !== $input['expectedRevision']) throw new ApiException(409, 'REVISION_CONFLICT', 'The content revision changed. Reload before importing.');
            $records = $input['records'];
            foreach ($records as &$record) {
                // The client may edit draft fields but cannot import a reviewed/published state.
                if (isset($record['status'])) $record['status'] = 'draft';
                if (isset($record['review']) && is_array($record['review'])) {
                    $record['review'] = ['status' => 'draft', 'sourceHash' => $input['sourceHash']];
                }
            }
            unset($record);
            $payload = ['kind' => $input['kind'], 'locale' => $input['locale'], 'sourceHash' => $input['sourceHash'], 'records' => $records];
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $id = self::id();
            $encrypted = $this->crypto->encrypt($json, 'admin-content:' . $id);
            $now = gmdate('Y-m-d H:i:s.u');
            $insert = $this->pdo->prepare('INSERT INTO content_versions(id,kind,locale,state,source_hash,payload_cipher,nonce,key_id,author_id,revision,created_at) VALUES (:id,:kind,:locale,\'draft\',UNHEX(:sourceHash),:cipher,:nonce,:keyId,:author,:revision,:created)');
            $insert->execute(['id' => $id, 'kind' => $input['kind'], 'locale' => $input['locale'], 'sourceHash' => $input['sourceHash'], 'cipher' => $encrypted['cipher'], 'nonce' => $encrypted['nonce'], 'keyId' => $encrypted['keyId'], 'author' => $actor, 'revision' => $revision + 1, 'created' => $now]);
            $this->audit($actor, 'content.import', $id, $now);
            $this->pdo->commit();
            return ['id' => $id, 'kind' => $input['kind'], 'state' => 'draft', 'sourceHash' => $input['sourceHash'], 'revision' => $revision + 1];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            if ($e instanceof \PDOException && (string)$e->getCode() === '23000') throw new ApiException(409,'REVISION_CONFLICT','Another import created this revision. Reload before importing.');
            throw $e;
        }
    }

    public function validate(string $id, string $actor): array
    {
        $version = $this->load($id);
        $errors = [];
        $payload = $version['payload'];
        $englishCatalog = json_decode((string)file_get_contents(dirname(__DIR__, 4) . '/content/locales/en.json'), true, flags: JSON_THROW_ON_ERROR);
        if ($payload['kind'] === 'ui-catalog' && !hash_equals(self::canonicalHash($englishCatalog['messages']), $payload['sourceHash'])) $errors[] = ['code'=>'STALE_SOURCE','recordId'=>'catalog'];
        foreach ($payload['records'] as $index => $record) {
            try { $this->schemas->assertValid($record, 'admin-' . $payload['kind'] . '.schema.json'); }
            catch (\InvalidArgumentException) { $errors[] = ['code' => 'SCHEMA_INVALID', 'recordId' => (string)($record['id'] ?? $record['key'] ?? $record['routeId'] ?? $index)]; }
        }
        $codes = [];
        foreach ($payload['records'] as $record) {
            if ($payload['kind'] === 'ui-catalog') {
                $key = $record['key'] ?? '';
                $source = $englishCatalog['messages'][$key] ?? null;
                if (!is_string($source)) {
                    $errors[] = ['code' => 'UNKNOWN_SOURCE_KEY', 'recordId' => (string)$key];
                } else {
                    $sourceHash = hash('sha256', $source);
                    if (!hash_equals($sourceHash, (string)($record['sourceHash'] ?? ''))) $errors[] = ['code' => 'STALE_SOURCE', 'recordId' => $key];
                    if (self::placeholders($source) !== self::placeholders((string)($record['message'] ?? ''))) $errors[] = ['code' => 'PLACEHOLDER_MISMATCH', 'recordId' => $key];
                    if (preg_match('/<\/?[A-Za-z][^>]*>|javascript:/i', (string)($record['message'] ?? ''))) $errors[] = ['code' => 'UNSAFE_MARKUP', 'recordId' => $key];
                }
            }
            if ($payload['kind'] === 'seo-copy' && isset($record['routeId'])) {
                if (isset($codes[$record['routeId']])) $errors[] = ['code' => 'DUPLICATE_ROUTE', 'recordId' => $record['routeId']];
                $codes[$record['routeId']] = true;
                if (preg_match('/<\/?[A-Za-z][^>]*>|javascript:/i', $record['bodyMarkdown'] ?? '')) $errors[] = ['code' => 'UNSAFE_MARKUP', 'recordId' => $record['routeId']];
            }
            if ($payload['kind'] === 'legal' && preg_match('/<\/?[A-Za-z][^>]*>|javascript:/i', $record['bodyMarkdown'] ?? '')) $errors[] = ['code' => 'UNSAFE_MARKUP', 'recordId' => $record['document'] ?? 'legal'];
            if ($payload['kind'] === 'pack') {
                if (($record['review']['sourceHash'] ?? null) !== $payload['sourceHash']) $errors[] = ['code' => 'STALE_SOURCE', 'recordId' => $record['id'] ?? 'pack'];
                $source = $record; unset($source['review']);
                if (!hash_equals(self::canonicalHash($source), $payload['sourceHash'])) $errors[] = ['code' => 'STALE_SOURCE', 'recordId' => $record['id'] ?? 'pack'];
                foreach (($record['cards'] ?? []) as $card) if (preg_match('/<\/?[A-Za-z][^>]*>|javascript:/i', $card['text'] ?? '')) $errors[] = ['code' => 'UNSAFE_MARKUP', 'recordId' => $card['id'] ?? 'card'];
            }
        }
        if ($payload['kind'] === 'preset' && !self::configuredAllowlist('LAVBE_APPROVED_PRESET_IDS', array_column($payload['records'], 'id'))) $errors[] = ['code' => 'PRESET_NOT_APPROVED', 'recordId' => '*'];
        if ($payload['kind'] === 'integration' && !self::configuredAllowlist('LAVBE_APPROVED_CMP_PROVIDERS', array_values(array_filter(array_column($payload['records'], 'cmpProvider'))))) $errors[] = ['code' => 'PROVIDER_NOT_APPROVED', 'recordId' => '*'];
        if ($errors === []) {
            $this->setState($id, 'validated', $actor, 'content.validate');
        }
        return ['valid' => $errors === [], 'errors' => array_slice($errors, 0, 5000)];
    }

    public function review(string $id, int $expectedRevision, string $actor, string $note): array
    {
        $this->pdo->beginTransaction();
        try {
            $q = $this->pdo->prepare('SELECT id,kind,locale,state,LOWER(HEX(source_hash)) source_hash,revision FROM content_versions WHERE id=:id FOR UPDATE');
            $q->execute(['id' => $id]); $row = $q->fetch();
            if (!$row) throw new ApiException(404, 'NOT_FOUND', 'The content version was not found.');
            if ((int)$row['revision'] !== $expectedRevision || $row['state'] !== 'validated') throw new ApiException(409, 'REVISION_CONFLICT', 'Only the current validated version can be reviewed.');
            $u = $this->pdo->prepare('UPDATE content_versions SET state=\'reviewed\',reviewer_id=:actor,reviewed_at=UTC_TIMESTAMP(6) WHERE id=:id AND state=\'validated\''); $u->execute(['actor'=>$actor,'id'=>$id]);
            $this->audit($actor, 'content.review', $id . ':' . substr(hash('sha256',$note),0,16), gmdate('Y-m-d H:i:s.u'));
            $this->pdo->commit();
            return ['id'=>$row['id'],'kind'=>$row['kind'],'state'=>'reviewed','sourceHash'=>$row['source_hash'],'revision'=>(int)$row['revision']];
        } catch (\Throwable $e) { if($this->pdo->inTransaction())$this->pdo->rollBack(); throw $e; }
    }

    public function get(string $id): array { $v=$this->load($id); return ['version'=>$v['summary'],'payload'=>$v['payload']]; }

    public function list(?string $cursor): array
    {
        $after = $cursor === null ? '' : self::decodeCursor($cursor);
        $q=$this->pdo->prepare('SELECT id,kind,state,LOWER(HEX(source_hash)) source_hash,revision FROM content_versions WHERE id>:after ORDER BY id LIMIT 51'); $q->execute(['after'=>$after]);
        $rows=$q->fetchAll(); $next=null; if(count($rows)>50){$last=array_pop($rows);$next=self::encodeCursor($last['id']);}
        return ['items'=>array_map(static fn($r)=>['id'=>$r['id'],'kind'=>$r['kind'],'state'=>$r['state'],'sourceHash'=>$r['source_hash'],'revision'=>(int)$r['revision']],$rows),'nextCursor'=>$next];
    }

    private function validateDraftImport(array $input): void
    {
        if (!isset($input['kind'],$input['locale'],$input['sourceHash'],$input['records'],$input['expectedRevision']) || !is_array($input['records']) || count($input['records'])>5000 || !preg_match('/^[a-f0-9]{64}$/',$input['sourceHash'])) throw new ApiException(400,'VALIDATION_ERROR','The import payload is invalid.');
        $spec = json_decode((string)file_get_contents(dirname(__DIR__, 4) . '/contracts/admin.openapi.json'), false, flags: JSON_THROW_ON_ERROR);
        $this->schemas->assertAgainst($input, $spec->components->schemas->DraftImport);
    }

    private function load(string $id): array
    {
        $q=$this->pdo->prepare('SELECT id,kind,locale,state,LOWER(HEX(source_hash)) source_hash,payload_cipher,nonce,key_id,revision FROM content_versions WHERE id=:id');$q->execute(['id'=>$id]);$r=$q->fetch();
        if(!$r)throw new ApiException(404,'NOT_FOUND','The content version was not found.');
        $payload=json_decode($this->crypto->decrypt($r['payload_cipher'],$r['nonce'],$r['key_id'],'admin-content:'.$id),true,flags:JSON_THROW_ON_ERROR);
        return ['payload'=>$payload,'summary'=>['id'=>$r['id'],'kind'=>$r['kind'],'locale'=>$r['locale'],'state'=>$r['state'],'sourceHash'=>$r['source_hash'],'revision'=>(int)$r['revision']]];
    }

    private function setState(string $id,string $state,string $actor,string $action):void
    { $q=$this->pdo->prepare('UPDATE content_versions SET state=:state WHERE id=:id AND state IN (\'draft\',\'validated\')');$q->execute(['state'=>$state,'id'=>$id]);$this->audit($actor,$action,$id,gmdate('Y-m-d H:i:s.u')); }
    private function audit(string $actor,string $action,string $object,string $now):void
    { $q=$this->pdo->prepare('INSERT INTO audit_events(id,actor_id,action_code,object_id,created_at) VALUES (:id,:actor,:action,:object,:created)');$q->execute(['id'=>self::id(),'actor'=>$actor,'action'=>$action,'object'=>substr($object,0,64),'created'=>$now]); }
    private static function configuredAllowlist(string $env,array $values):bool
    { $raw=getenv($env);if($raw===false||$raw==='')return $values===[];$allowed=array_filter(array_map('trim',explode(',',$raw)));foreach($values as $v)if(!in_array($v,$allowed,true))return false;return true; }
    private static function id():string{return bin2hex(random_bytes(16));}
    private static function placeholders(string $message):array{preg_match_all('/\{([A-Za-z][A-Za-z0-9_]*)\}/',$message,$m);$v=$m[1];sort($v,SORT_STRING);return $v;}
    private static function canonicalHash(array $value):string{return hash('sha256',self::canonical($value));}
    private static function canonical(mixed $value):string
    {
        if(is_array($value)){
            if(array_is_list($value))return '['.implode(',',array_map(self::canonical(...),$value)).']';
            ksort($value,SORT_STRING);$pairs=[];foreach($value as $k=>$v)$pairs[]=json_encode((string)$k,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).':'.self::canonical($v);return '{'.implode(',',$pairs).'}';
        }
        return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    }
    private static function encodeCursor(string $id):string{return rtrim(strtr(base64_encode($id),'+/','-_'),'=');}
    private static function decodeCursor(string $s):string{$v=base64_decode(strtr($s,'-_','+/'),true);if($v===false||!preg_match('/^[a-f0-9]{32}$/',$v))throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');return $v;}
}
