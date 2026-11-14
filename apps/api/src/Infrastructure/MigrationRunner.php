<?php

declare(strict_types=1);

namespace Lavbe\Api\Infrastructure;

use PDO;

final class MigrationRunner
{
    public function __construct(private readonly PDO $pdo) {}

    public function migrate(): void
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INT UNSIGNED NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $applied = array_fill_keys(array_map('intval', $this->pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN)), true);
        foreach (glob(dirname(__DIR__, 2) . '/database/migrations/*.sql') ?: [] as $file) {
            if (!preg_match('/^(\d{4})_[a-z0-9_-]+\.sql$/', basename($file), $match)) {
                throw new \RuntimeException('Migration filename is invalid.');
            }
            $version = (int) $match[1];
            if (isset($applied[$version])) {
                continue;
            }
            if (in_array($version, $applied, true)) {
                throw new \RuntimeException('Migration version is duplicated.');
            }
            $sql = file_get_contents($file);
            if ($sql === false || trim($sql) === '') {
                throw new \RuntimeException('Migration file is empty.');
            }
            // MySQL DDL auto-commits; migrations are forward-only, idempotent DDL and recorded last.
            $this->pdo->exec($sql);
            $statement = $this->pdo->prepare('INSERT INTO schema_migrations(version) VALUES (:version)');
            $statement->execute(['version' => $version]);
            $applied[$version] = true;
        }
    }
}
