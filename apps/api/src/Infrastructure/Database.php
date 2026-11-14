<?php

declare(strict_types=1);

namespace Lavbe\Api\Infrastructure;

use PDO;

final class Database
{
    public static function connect(Config $config): PDO
    {
        return new PDO($config->databaseDsn, $config->databaseUser, $config->databasePassword, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci, SESSION sql_mode='STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION', time_zone='+00:00'",
        ]);
    }
}
