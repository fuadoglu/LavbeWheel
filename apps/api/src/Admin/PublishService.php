<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use PDO;
use Lavbe\Api\Http\ApiException;

final class PublishService
{
    public function __construct(private readonly PDO $pdo,private readonly ContentService $content){}

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

    public function manifest(string $id,string $credential,int $now):array
    {
        $job=$this->runnerJob($id,$credential,$now);
        if(!in_array($job['state'],['queued','exporting','validating','building','awaiting-promotion','deploying'],true))throw new ApiException(409,'REVISION_CONFLICT','This runner job is no longer active.');
        if($job['state']==='queued'){$q=$this->pdo->prepare("UPDATE publish_jobs SET state='exporting',updated_at=FROM_UNIXTIME(:now) WHERE id=:id AND state='queued'");$q->execute(['now'=>$now,'id'=>$id]);$job['state']='exporting';}
        $versions=$this->jobVersions($id);
        if(!hash_equals(bin2hex($job['manifest_hash']),CanonicalJson::hash($versions)))throw new ApiException(409,'REVISION_CONFLICT','The saved publication manifest failed its integrity check.');
        $rollback=$job['rollback_target_hash']===null?null:bin2hex($job['rollback_target_hash']);
        return ['manifestHash'=>bin2hex($job['manifest_hash']),'buildId'=>$id,'createdAt'=>gmdate('Y-m-d\TH:i:s\Z',strtotime($job['created_at'].' UTC')),'state'=>$job['state'],'mode'=>$job['job_type'],'rollbackArtifactHash'=>$rollback,'versions'=>$versions];
    }

    public function update(string $id,string $credential,array $input,int $now):array
    {
        if(array_diff(array_keys($input),['state','artifactHash','errorCode'])!==[]||!isset($input['state'])||!is_string($input['state'])||!array_key_exists('artifactHash',$input)||!array_key_exists('errorCode',$input)
            ||($input['artifactHash']!==null&&(!is_string($input['artifactHash'])||!preg_match('/^[a-f0-9]{64}$/',$input['artifactHash'])))
            ||($input['errorCode']!==null&&(!is_string($input['errorCode'])||strlen($input['errorCode'])>100)))throw new ApiException(400,'VALIDATION_ERROR','The runner update is invalid.');
        $this->runnerJob($id,$credential,$now);
        $this->pdo->beginTransaction();
        try{
            $q=$this->pdo->prepare('SELECT state,job_type,artifact_hash,rollback_target_hash,actor_id FROM publish_jobs WHERE id=:id FOR UPDATE');$q->execute(['id'=>$id]);$job=$q->fetch();
            if(!$job)throw new ApiException(404,'NOT_FOUND','The publish job was not found.');
            $next=$input['state'];$current=$job['state'];$artifact=$input['artifactHash'];$error=$input['errorCode'];
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
            $update=$this->pdo->prepare('UPDATE publish_jobs SET state=:state,artifact_hash=COALESCE(UNHEX(:artifact),artifact_hash),error_code=:error,runner_token_hash=IF(:terminal=1,NULL,runner_token_hash),updated_at=FROM_UNIXTIME(:now) WHERE id=:id');
            $terminal=in_array($next,['failed','succeeded'],true)?1:0;
            $update->execute(['state'=>$next,'artifact'=>$artifact,'error'=>$error,'terminal'=>$terminal,'now'=>$now,'id'=>$id]);
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
