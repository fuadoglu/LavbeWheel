<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use PDO;
use Lavbe\Api\Http\ApiException;

final class PublishService
{
    public function __construct(private readonly PDO $pdo,private readonly ContentService $content,private readonly ?string $manifestSigningSecretKey=null){}

    public function create(array $input,string $actor,int $now):array
    {
        if(array_diff(array_keys($input),['versionIds','manifestHash'])!==[]||!isset($input['versionIds'],$input['manifestHash'])||!is_array($input['versionIds'])||!is_string($input['manifestHash'])||!preg_match('/^[a-f0-9]{64}$/',$input['manifestHash']))throw new ApiException(400,'VALIDATION_ERROR','The publish request is invalid.');
        $versions=$this->content->publicationVersions($input['versionIds']);$actualHash=CanonicalJson::hash($versions);
        if(!hash_equals($actualHash,$input['manifestHash']))throw new ApiException(409,'REVISION_CONFLICT','The selected content changed; recompute the manifest digest.');
        $id=bin2hex(random_bytes(16));$credential=self::token();$expires=$now+7200;$date=gmdate('Y-m-d H:i:s.u',$now);
        $this->pdo->beginTransaction();
        try{
            $q=$this->pdo->prepare("INSERT INTO publish_jobs(id,job_type,state,manifest_hash,actor_id,runner_token_hash,runner_expires_at,created_at,updated_at) VALUES (:id,'publish','queued',UNHEX(:hash),:actor,:tokenHash,FROM_UNIXTIME(:expires),:created,:updated)");
            $q->execute(['id'=>$id,'hash'=>$actualHash,'actor'=>$actor,'tokenHash'=>hash('sha256',$credential,true),'expires'=>$expires,'created'=>$date,'updated'=>$date]);
            $insert=$this->pdo->prepare('INSERT INTO publish_job_versions(job_id,version_id,revision) VALUES (:job,:version,:revision)');
            foreach($versions as $v)$insert->execute(['job'=>$id,'version'=>$v['id'],'revision'=>$v['revision']]);
            $this->audit($actor,'publish.job.create',$id);
            $this->pdo->commit();
            return ['job'=>$this->job($id),'runnerCredential'=>$credential];
        }catch(\Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }

    public function get(string $id):array{return $this->job($id);}

    public function list(?string $cursor):array
    {
        if($cursor===null){$q=$this->pdo->query('SELECT id,job_type,state,artifact_hash,error_code,rollback_target_hash,created_at FROM publish_jobs ORDER BY created_at DESC,id DESC LIMIT 51');}
        else{
            if(!preg_match('/^[A-Za-z0-9_-]{1,200}$/',$cursor))throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');
            $decoded=base64_decode(strtr($cursor,'-_','+/').str_repeat('=',(4-strlen($cursor)%4)%4),true);
            $parts=$decoded===false?[]:explode("\n",$decoded);
            if(count($parts)!==2||!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/',$parts[0])||!preg_match('/^[A-Za-z0-9_-]{8,64}$/',$parts[1]))throw new ApiException(400,'VALIDATION_ERROR','The page cursor is invalid.');
            $q=$this->pdo->prepare('SELECT id,job_type,state,artifact_hash,error_code,rollback_target_hash,created_at FROM publish_jobs WHERE created_at<:createdBefore OR (created_at=:createdAt AND id<:id) ORDER BY created_at DESC,id DESC LIMIT 51');
            $q->execute(['createdBefore'=>$parts[0],'createdAt'=>$parts[0],'id'=>$parts[1]]);
        }
        $rows=$q->fetchAll();$next=null;if(count($rows)>50){$last=$rows[49];$next=rtrim(strtr(base64_encode($last['created_at']."\n".$last['id']),'+/','-_'),'=');$rows=array_slice($rows,0,50);}
        return ['items'=>array_map(static fn(array $row):array=>[
            'id'=>$row['id'],'state'=>$row['state'],'artifactHash'=>$row['artifact_hash']===null?null:bin2hex($row['artifact_hash']),
            'errorCode'=>$row['error_code'],'mode'=>$row['job_type'],'rollbackTargetHash'=>$row['rollback_target_hash']===null?null:bin2hex($row['rollback_target_hash']),
        ],$rows),'nextCursor'=>$next];
    }

    public function active():array
    {
        $active=$this->pdo->query('SELECT a.job_id,LOWER(HEX(a.artifact_hash)) artifact_hash,DATE_FORMAT(a.updated_at,\'%Y-%m-%dT%H:%i:%sZ\') updated_at FROM active_publications a WHERE a.singleton_id=1')->fetch();
        $history=$this->pdo->query('SELECT h.job_id,LOWER(HEX(h.artifact_hash)) artifact_hash,DATE_FORMAT(h.released_at,\'%Y-%m-%dT%H:%i:%sZ\') released_at FROM publication_history h ORDER BY h.released_at DESC LIMIT 50')->fetchAll();
        return ['active'=>$active?['jobId'=>$active['job_id'],'artifactHash'=>$active['artifact_hash'],'updatedAt'=>$active['updated_at']]:null,
            'knownGood'=>array_map(static fn(array $row):array=>['jobId'=>$row['job_id'],'artifactHash'=>$row['artifact_hash'],'releasedAt'=>$row['released_at']],$history)];
    }

    public function manifest(string $id,string $credential,int $now):array
    {
        $job=$this->runnerJob($id,$credential,$now);
        if(!in_array($job['state'],['queued','exporting','validating','building','awaiting-promotion','deploying'],true))throw new ApiException(409,'REVISION_CONFLICT','This runner job is no longer active.');
        if($job['state']==='queued'){$q=$this->pdo->prepare("UPDATE publish_jobs SET state='exporting',updated_at=FROM_UNIXTIME(:now) WHERE id=:id AND state='queued'");$q->execute(['now'=>$now,'id'=>$id]);$job['state']='exporting';}
        $versions=$this->jobVersions($id);
        if(!hash_equals(bin2hex($job['manifest_hash']),CanonicalJson::hash($versions)))throw new ApiException(409,'REVISION_CONFLICT','The saved publication manifest failed its integrity check.');
        $rollback=$job['rollback_target_hash']===null?null:bin2hex($job['rollback_target_hash']);
        if($this->manifestSigningSecretKey===null||strlen($this->manifestSigningSecretKey)!==SODIUM_CRYPTO_SIGN_SECRETKEYBYTES)throw new ApiException(503,'SERVICE_UNAVAILABLE','The manifest signer is not configured.',30);
        $manifest=['manifestHash'=>bin2hex($job['manifest_hash']),'buildId'=>$id,'createdAt'=>gmdate('Y-m-d\TH:i:s\Z',strtotime($job['created_at'].' UTC')),'state'=>$job['state'],'artifactHash'=>$job['artifact_hash']===null?null:bin2hex($job['artifact_hash']),'mode'=>$job['job_type'],'rollbackArtifactHash'=>$rollback,'signatureAlgorithm'=>'Ed25519','versions'=>$versions];
        $signature=sodium_crypto_sign_detached(CanonicalJson::encode($manifest),$this->manifestSigningSecretKey);
        $manifest['signature']=rtrim(strtr(base64_encode($signature),'+/','-_'),'=');
        return $manifest;
    }

    public function update(string $id,string $credential,array $input,int $now):array
    {
        if(array_diff(array_keys($input),['state','artifactHash','errorCode'])!==[]||!isset($input['state'])||!is_string($input['state'])||!array_key_exists('artifactHash',$input)||!array_key_exists('errorCode',$input)
            ||($input['artifactHash']!==null&&(!is_string($input['artifactHash'])||!preg_match('/^[a-f0-9]{64}$/',$input['artifactHash'])))
            ||($input['errorCode']!==null&&(!is_string($input['errorCode'])||strlen($input['errorCode'])>100)))throw new ApiException(400,'VALIDATION_ERROR','The runner update is invalid.');
        $this->runnerJob($id,$credential,$now);
        $this->pdo->beginTransaction();
        try{
            $q=$this->pdo->prepare('SELECT state,job_type,artifact_hash,rollback_target_hash,actor_id,error_code FROM publish_jobs WHERE id=:id FOR UPDATE');$q->execute(['id'=>$id]);$job=$q->fetch();
            if(!$job)throw new ApiException(404,'NOT_FOUND','The publish job was not found.');
            $next=$input['state'];$current=$job['state'];$artifact=$input['artifactHash'];$error=$input['errorCode'];
            if(in_array($current,['succeeded','failed'],true)&&$next===$current
                &&(($current==='succeeded'&&$artifact!==null&&$job['artifact_hash']!==null&&hash_equals(bin2hex($job['artifact_hash']),$artifact))
                    ||($current==='failed'&&$artifact===null&&$error===$job['error_code']))) {
                $this->pdo->commit();
                return $this->job($id);
            }
            $allowed=['queued'=>['exporting','failed'],'exporting'=>['exporting','validating','failed'],'validating'=>['validating','building','failed'],'building'=>['building','awaiting-promotion','failed'],'awaiting-promotion'=>['awaiting-promotion','failed'],'deploying'=>['deploying','succeeded','failed']];
            if(!in_array($next,$allowed[$current]??[],true))throw new ApiException(409,'REVISION_CONFLICT','The runner job state transition is invalid.');
            if(($next==='awaiting-promotion'||$next==='succeeded')&&$artifact===null)throw new ApiException(400,'VALIDATION_ERROR','A completed build requires its artifact hash.');
            if($next==='failed'&&($error===null||$error===''))throw new ApiException(400,'VALIDATION_ERROR','A failed job requires a stable error code.');
            if($next!=='failed'&&$error!==null)throw new ApiException(400,'VALIDATION_ERROR','Successful job states cannot include an error code.');
            if($next==='succeeded'){
                $expected=$job['job_type']==='rollback'?$job['rollback_target_hash']:$job['artifact_hash'];
                if($expected===null||!hash_equals(bin2hex($expected),$artifact))throw new ApiException(409,'REVISION_CONFLICT','The deployed artifact does not match the approved artifact.');
                $this->activate($id,$artifact,$job['actor_id'],$now);
            }elseif($next==='awaiting-promotion'){
                if($job['job_type']!=='publish')throw new ApiException(409,'REVISION_CONFLICT','Rollback jobs do not enter the promotion queue.');
            }
            $update=$this->pdo->prepare('UPDATE publish_jobs SET state=:state,artifact_hash=COALESCE(UNHEX(:artifact),artifact_hash),error_code=:error,updated_at=FROM_UNIXTIME(:now) WHERE id=:id');
            $update->execute(['state'=>$next,'artifact'=>$artifact,'error'=>$error,'now'=>$now,'id'=>$id]);
            $this->audit($job['actor_id'],'publish.runner.'.$next,$id);
            $this->pdo->commit();return $this->job($id);
        }catch(\Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }

    public function promote(string $id,string $artifact,string $actor,int $now):array
    {
        $this->pdo->beginTransaction();
        try{$q=$this->pdo->prepare('SELECT state,job_type,artifact_hash FROM publish_jobs WHERE id=:id FOR UPDATE');$q->execute(['id'=>$id]);$j=$q->fetch();
            if(!$j)throw new ApiException(404,'NOT_FOUND','The publish job was not found.');
            if($j['job_type']!=='publish'||$j['state']!=='awaiting-promotion'||$j['artifact_hash']===null||!hash_equals(bin2hex($j['artifact_hash']),$artifact))throw new ApiException(409,'REVISION_CONFLICT','Only the exact validated artifact can be promoted.');
            $u=$this->pdo->prepare("UPDATE publish_jobs SET state='deploying',updated_at=FROM_UNIXTIME(:now) WHERE id=:id");$u->execute(['now'=>$now,'id'=>$id]);$this->audit($actor,'publish.promote',$id);$this->pdo->commit();return $this->job($id);
        }catch(\Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }

    public function rollback(string $currentJobId,string $target,string $actor,int $now):array
    {
        if(!preg_match('/^[a-f0-9]{64}$/',$target))throw new ApiException(400,'VALIDATION_ERROR','The rollback artifact hash is invalid.');
        $this->pdo->beginTransaction();
        try{
            $active=$this->pdo->query('SELECT job_id,LOWER(HEX(artifact_hash)) artifact_hash FROM active_publications WHERE singleton_id=1 FOR UPDATE')->fetch();
            if(!$active||$active['job_id']!==$currentJobId)throw new ApiException(409,'REVISION_CONFLICT','Rollback must target the active publication job.');
            if(hash_equals($active['artifact_hash'],$target))throw new ApiException(409,'REVISION_CONFLICT','The selected artifact is already active.');
            $history=$this->pdo->prepare('SELECT h.job_id,j.manifest_hash FROM publication_history h JOIN publish_jobs j ON j.id=h.job_id WHERE h.artifact_hash=UNHEX(:hash) FOR UPDATE');$history->execute(['hash'=>$target]);$old=$history->fetch();
            if(!$old)throw new ApiException(409,'REVISION_CONFLICT','Rollback target is not a known-good publication.');
            $id=bin2hex(random_bytes(16));$credential=self::token();$expires=$now+7200;$date=gmdate('Y-m-d H:i:s.u',$now);
            $insert=$this->pdo->prepare("INSERT INTO publish_jobs(id,job_type,state,manifest_hash,artifact_hash,rollback_target_hash,actor_id,runner_token_hash,runner_expires_at,created_at,updated_at) VALUES (:id,'rollback','deploying',:manifest,UNHEX(:targetArtifact),UNHEX(:rollbackTarget),:actor,:token,FROM_UNIXTIME(:expires),:created,:updated)");
            $insert->execute(['id'=>$id,'manifest'=>$old['manifest_hash'],'targetArtifact'=>$target,'rollbackTarget'=>$target,'actor'=>$actor,'token'=>hash('sha256',$credential,true),'expires'=>$expires,'created'=>$date,'updated'=>$date]);
            $copy=$this->pdo->prepare('INSERT INTO publish_job_versions(job_id,version_id,revision) SELECT :newJob,version_id,revision FROM publish_job_versions WHERE job_id=:oldJob');$copy->execute(['newJob'=>$id,'oldJob'=>$old['job_id']]);
            $this->audit($actor,'publish.rollback',$id);$this->pdo->commit();return ['job'=>$this->job($id),'runnerCredential'=>$credential];
        }catch(\Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}
    }

    private function activate(string $id,string $artifact,string $actor,int $now):void
    {
        $current=$this->pdo->query('SELECT job_id FROM active_publications WHERE singleton_id=1 FOR UPDATE')->fetchColumn();
        if(is_string($current)){
            $archive=$this->pdo->prepare("UPDATE content_versions cv JOIN publish_job_versions pv ON pv.version_id=cv.id SET cv.state='archived' WHERE pv.job_id=:job AND cv.state='published'");$archive->execute(['job'=>$current]);
            $rolled=$this->pdo->prepare("UPDATE publish_jobs SET state='rolled-back',updated_at=FROM_UNIXTIME(:now) WHERE id=:job AND state='succeeded'");$rolled->execute(['now'=>$now,'job'=>$current]);
        }
        $publish=$this->pdo->prepare("UPDATE content_versions cv JOIN publish_job_versions pv ON pv.version_id=cv.id SET cv.state='published' WHERE pv.job_id=:job AND cv.state IN ('reviewed','archived','published')");$publish->execute(['job'=>$id]);
        $job=$this->pdo->prepare('SELECT artifact_hash FROM publish_jobs WHERE id=:id');$job->execute(['id'=>$id]);$hash=$job->fetchColumn();
        $history=$this->pdo->prepare('INSERT IGNORE INTO publication_history(artifact_hash,job_id,released_at) VALUES (:hash,:job,FROM_UNIXTIME(:now))');$history->execute(['hash'=>hex2bin($artifact),'job'=>$id,'now'=>$now]);
        $active=$this->pdo->prepare('INSERT INTO active_publications(singleton_id,job_id,artifact_hash,updated_at) VALUES (1,:job,:hash,FROM_UNIXTIME(:now)) ON DUPLICATE KEY UPDATE job_id=VALUES(job_id),artifact_hash=VALUES(artifact_hash),updated_at=VALUES(updated_at)');$active->execute(['job'=>$id,'hash'=>hex2bin($artifact),'now'=>$now]);
        $this->audit($actor,'publish.active.update',$id);
    }

    private function jobVersions(string $id):array
    {
        $q=$this->pdo->prepare('SELECT version_id,revision FROM publish_job_versions WHERE job_id=:id ORDER BY version_id');$q->execute(['id'=>$id]);$versions=[];
        foreach($q->fetchAll() as $row){$v=$this->content->get($row['version_id']);if($v['version']['revision']!==(int)$row['revision'])throw new ApiException(409,'REVISION_CONFLICT','A saved content revision is unavailable.');$versions[]=['id'=>$row['version_id'],'revision'=>(int)$row['revision'],'payload'=>$v['payload']];}
        return $versions;
    }

    private function runnerJob(string $id,string $credential,int $now):array
    {
        if(!preg_match('/^[A-Za-z0-9_-]{43}$/',$credential))throw new ApiException(401,'AUTHENTICATION_REQUIRED','The runner credential is invalid.');
        $q=$this->pdo->prepare('SELECT id,job_type,state,manifest_hash,artifact_hash,rollback_target_hash,actor_id,runner_token_hash,runner_expires_at,created_at FROM publish_jobs WHERE id=:id');$q->execute(['id'=>$id]);$job=$q->fetch();
        if(!$job||$job['runner_token_hash']===null||strtotime($job['runner_expires_at'].' UTC')<=$now||!hash_equals($job['runner_token_hash'],hash('sha256',$credential,true)))throw new ApiException(401,'AUTHENTICATION_REQUIRED','The runner credential is invalid or expired.');
        return $job;
    }

    private function job(string $id):array
    {
        $q=$this->pdo->prepare('SELECT id,job_type,state,artifact_hash,error_code,rollback_target_hash FROM publish_jobs WHERE id=:id');$q->execute(['id'=>$id]);$r=$q->fetch();
        if(!$r)throw new ApiException(404,'NOT_FOUND','The publish job was not found.');
        return ['id'=>$r['id'],'state'=>$r['state'],'artifactHash'=>$r['artifact_hash']===null?null:bin2hex($r['artifact_hash']),'errorCode'=>$r['error_code'],'mode'=>$r['job_type'],'rollbackTargetHash'=>$r['rollback_target_hash']===null?null:bin2hex($r['rollback_target_hash'])];
    }

    private function audit(string $actor,string $action,string $object):void{$q=$this->pdo->prepare('INSERT INTO audit_events(id,actor_id,action_code,object_id,created_at) VALUES (:id,:actor,:action,:object,UTC_TIMESTAMP(6))');$q->execute(['id'=>bin2hex(random_bytes(16)),'actor'=>$actor,'action'=>$action,'object'=>$object]);}
    private static function token():string{return rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');}
}
