<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use PDO;
use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Limits;

final class AdminOperationsService
{
    public function __construct(private readonly PDO $pdo) {}

    public function updateUser(string $id, array $input, string $actor): array
    {
        if (array_diff(array_keys($input), ['username','role','disabled']) !== []
            || !isset($input['username'],$input['role'],$input['disabled'])
            || !is_string($input['username']) || !preg_match('/^[a-z0-9][a-z0-9._-]{2,79}$/', strtolower($input['username']))
            || !in_array($input['role'], ['owner','editor','reviewer','publisher'], true) || !is_bool($input['disabled'])) {
            throw new ApiException(400,'VALIDATION_ERROR','The administrator update is invalid.');
        }
        $this->pdo->beginTransaction();
        try {
            $q=$this->pdo->prepare('SELECT username,role,disabled_at FROM admin_users WHERE id=:id FOR UPDATE');
            $q->execute(['id'=>$id]); $row=$q->fetch();
            if(!$row)throw new ApiException(404,'NOT_FOUND','The administrator was not found.');
            $wouldRemainOwner = $input['role']==='owner' && !$input['disabled'];
            if($row['role']==='owner' && $row['disabled_at']===null && !$wouldRemainOwner){
                $owners=$this->pdo->query("SELECT id FROM admin_users WHERE role='owner' AND disabled_at IS NULL FOR UPDATE")->fetchAll(PDO::FETCH_COLUMN);
                if(count($owners)<=1)throw new ApiException(409,'REVISION_CONFLICT','The last active owner cannot be demoted or disabled.');
            }
            $update=$this->pdo->prepare('UPDATE admin_users SET username=:username,role=:role,disabled_at=:disabled,revision=revision+1,updated_at=UTC_TIMESTAMP(6) WHERE id=:id');
            $update->execute(['username'=>strtolower($input['username']),'role'=>$input['role'],'disabled'=>$input['disabled']?gmdate('Y-m-d H:i:s.u'):null,'id'=>$id]);
            $sessions=$this->pdo->prepare('DELETE FROM admin_sessions WHERE user_id=:id');$sessions->execute(['id'=>$id]);
            $this->writeAudit($actor,'admin.user.update',$id);
            $this->pdo->commit();
            return ['username'=>strtolower($input['username']),'role'=>$input['role'],'disabled'=>$input['disabled']];
        } catch(\PDOException $e) {
            if($this->pdo->inTransaction())$this->pdo->rollBack();
            if((string)$e->getCode()==='23000')throw new ApiException(409,'REVISION_CONFLICT','That administrator username is already in use.');
            throw $e;
        } catch(\Throwable $e) { if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e; }
    }

    public function audit(?string $cursor):array
    {
        $after=$cursor===null?'':self::decodeCursor($cursor);
        $q=$this->pdo->prepare('SELECT id,actor_id,action_code,object_id,DATE_FORMAT(created_at,\'%Y-%m-%dT%H:%i:%sZ\') at FROM audit_events WHERE id>:after ORDER BY id LIMIT 51');$q->execute(['after'=>$after]);
        $rows=$q->fetchAll();$next=null;if(count($rows)>50){$last=array_pop($rows);$next=self::encodeCursor($last['id']);}
        return ['items'=>array_map(static fn($r)=>['id'=>$r['id'],'actorId'=>$r['actor_id'],'action'=>$r['action_code'],'objectId'=>$r['object_id'],'at'=>$r['at']],$rows),'nextCursor'=>$next];
    }

    public function revokeShare(string $shareId,string $reasonCode,string $actor,int $now):void
    {
        if(!in_array($reasonCode,['abuse','rights-request','security','operator'],true))throw new ApiException(400,'VALIDATION_ERROR','The revocation reason is invalid.');
        $this->pdo->beginTransaction();
        try{
            $q=$this->pdo->prepare('SELECT expires_at,revoked_at FROM shares WHERE id=:id FOR UPDATE');$q->execute(['id'=>$shareId]);$row=$q->fetch();
            if(!$row)throw new ApiException(404,'NOT_FOUND','The share was not found.');
            if($row['revoked_at']===null){
                $update=$this->pdo->prepare("UPDATE shares SET revoked_at=FROM_UNIXTIME(:now),unavailable_reason='revoked',payload_cipher=NULL,nonce=NULL WHERE id=:id");$update->execute(['now'=>$now,'id'=>$shareId]);
                $journal=$this->pdo->prepare('INSERT INTO deletion_journal(share_id_hash,deleted_at,retain_until) VALUES (:hash,FROM_UNIXTIME(:now),FROM_UNIXTIME(:retain)) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at),retain_until=VALUES(retain_until)');
                $journal->execute(['hash'=>hash('sha256',$shareId,true),'now'=>$now,'retain'=>$now+Limits::retention()['backupDays']*86400]);
            }
            $this->writeAudit($actor,'share.revoke.'.$reasonCode,$shareId);
            $this->pdo->commit();
        }catch(\Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }

    private function writeAudit(string $actor,string $action,string $object):void
    { $q=$this->pdo->prepare('INSERT INTO audit_events(id,actor_id,action_code,object_id,created_at) VALUES (:id,:actor,:action,:object,UTC_TIMESTAMP(6))');$q->execute(['id'=>bin2hex(random_bytes(16)),'actor'=>$actor,'action'=>$action,'object'=>substr($object,0,64)]); }
    private static function encodeCursor(string $id):string{return rtrim(strtr(base64_encode($id),'+/','-_'),'=');}
    private static function decodeCursor(string $s):string{$v=base64_decode(strtr($s,'-_','+/'),true);if($v===false||!preg_match('/^[a-f0-9]{32}$/',$v))throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');return $v;}
}
