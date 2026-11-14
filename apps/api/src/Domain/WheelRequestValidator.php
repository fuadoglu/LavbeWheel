<?php

declare(strict_types=1);

namespace Lavbe\Api\Domain;

use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Limits;

final class WheelRequestValidator
{
    public function __construct(private readonly WheelSemanticValidator $semantic) {}

    public function validateCreate(array $request): array
    {
        if (!$this->keys($request, ['wheel', 'ttlDays']) || !isset($request['wheel'], $request['ttlDays'])
            || !is_array($request['wheel']) || !in_array($request['ttlDays'], Limits::sharing()['allowedTtlDays'], true)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The request is invalid.');
        }
        $wheel = $request['wheel'];
        $this->validateWheelShape($wheel);
        $code = $this->semantic->validate($wheel);
        if ($code !== 'OK') {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel does not meet sharing requirements.');
        }
        $wheel = $this->semantic->normalizeForStorage($wheel);
        $wheel['entries'] = array_values(array_filter($wheel['entries'], static fn (array $entry): bool => $entry['active']));
        return ['wheel' => $wheel, 'ttlDays' => $request['ttlDays']];
    }

    private function validateWheelShape(array $wheel): void
    {
        $required = ['schemaVersion', 'tool', 'title', 'locale', 'mode', 'entries', 'settings'];
        if (!$this->keys($wheel, [...$required, 'range', 'teamCount', 'seats', 'game'])
            || array_diff($required, array_keys($wheel)) !== [] || $wheel['schemaVersion'] !== 1
            || !is_string($wheel['title']) || !is_string($wheel['locale']) || !is_string($wheel['tool'])
            || !is_string($wheel['mode']) || !is_array($wheel['entries']) || !array_is_list($wheel['entries'])
            || mb_strlen($wheel['title'], 'UTF-8') > 1024 || !is_array($wheel['settings']) || !is_array($wheel['settings'])) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel does not match the supported shape.');
        }
        $locale = json_decode(file_get_contents(dirname(__DIR__, 4) . '/config/locales.json'), true, flags: JSON_THROW_ON_ERROR);
        $locales = array_column($locale['locales'] ?? [], 'code');
        if (!in_array($wheel['locale'], $locales, true)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel locale is unsupported.');
        }
        foreach ($wheel['entries'] as $entry) {
            if (!is_array($entry) || !$this->keys($entry, ['id', 'label', 'weight', 'active'])
                || array_diff(['id', 'label', 'weight', 'active'], array_keys($entry)) !== []
                || !is_string($entry['id']) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $entry['id'])
                || !is_string($entry['label']) || !preg_match('//u', $entry['label'])
                || mb_strlen($entry['label'], 'UTF-8') > 2048
                || trim($entry['label']) === '' || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $entry['label'])
                || !is_int($entry['weight']) || $entry['weight'] < 1 || $entry['weight'] > 1000
                || !is_bool($entry['active'])) {
                throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel contains an invalid entry.');
            }
        }
        $settings = $wheel['settings'];
        if (!$this->keys($settings, ['theme', 'style', 'motion', 'sound', 'spinSeconds'])
            || array_diff(['theme', 'style', 'motion', 'sound', 'spinSeconds'], array_keys($settings)) !== []
            || !in_array($settings['theme'], ['system', 'light', 'dark'], true)
            || !in_array($settings['style'], ['classic', 'bottle', 'couples', 'friends', 'education'], true)
            || !in_array($settings['motion'], ['quiet', 'standard', 'party'], true)
            || !is_bool($settings['sound']) || !is_numeric($settings['spinSeconds'])
            || $settings['spinSeconds'] < 1 || $settings['spinSeconds'] > 10) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel settings are invalid.');
        }
        $toolModes = [
            'names' => ['independent', 'remove-winner'], 'weighted' => ['independent', 'remove-winner'],
            'numbers' => ['independent'], 'yes-no' => ['independent'], 'teams' => ['independent'],
            'bottle' => ['independent', 'remove-winner', 'shuffled-cycle'], 'game' => ['independent', 'remove-winner', 'shuffled-cycle'],
        ];
        if (!isset($toolModes[$wheel['tool']]) || !in_array($wheel['mode'], $toolModes[$wheel['tool']], true)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel tool or mode is unsupported.');
        }
        if ($wheel['tool'] === 'numbers' && $wheel['entries'] !== []) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'Number tools cannot contain named entries.');
        }
        if ($wheel['tool'] === 'yes-no' && (count($wheel['entries']) !== 2
            || count(array_filter($wheel['entries'], static fn (array $entry): bool => !$entry['active'] || $entry['weight'] !== 1)) !== 0)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The yes/no wheel must contain two active equal options.');
        }
        $specific = ['range' => 'numbers', 'teamCount' => 'teams', 'seats' => 'bottle', 'game' => 'game'];
        foreach ($specific as $key => $tool) {
            if (($wheel['tool'] === $tool) !== array_key_exists($key, $wheel)) {
                throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel contains an unsupported tool field.');
            }
        }
        if ($wheel['tool'] === 'numbers' && (!is_array($wheel['range']) || !$this->keys($wheel['range'], ['min', 'max'])
            || array_diff(['min', 'max'], array_keys($wheel['range'])) !== [] || !is_int($wheel['range']['min']) || !is_int($wheel['range']['max'])
            || $wheel['range']['min'] < -1000000 || $wheel['range']['max'] > 1000000)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The number range is invalid.');
        }
        if ($wheel['tool'] === 'teams' && (!is_int($wheel['teamCount']) || $wheel['teamCount'] < 2 || $wheel['teamCount'] > 50)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The team count is invalid.');
        }
        if ($wheel['tool'] === 'bottle' && (!is_array($wheel['seats']) || !array_is_list($wheel['seats'])
            || count($wheel['seats']) < 2 || count($wheel['seats']) > 20
            || count(array_filter($wheel['seats'], static fn ($id): bool => is_string($id) && preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id))) !== count($wheel['seats']))) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The bottle seats are invalid.');
        }
        if ($wheel['tool'] === 'game' && (!is_array($wheel['game']) || !$this->keys($wheel['game'], ['packId', 'packVersion'])
            || array_diff(['packId', 'packVersion'], array_keys($wheel['game'])) !== []
            || !is_string($wheel['game']['packId']) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $wheel['game']['packId'])
            || !is_int($wheel['game']['packVersion']) || $wheel['game']['packVersion'] < 1)) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The game reference is invalid.');
        }
        if (count($wheel['entries']) > 1000) {
            throw new ApiException(400, 'VALIDATION_ERROR', 'The wheel has too many entries.');
        }
    }

    private function keys(array $value, array $allowed): bool
    {
        return array_diff(array_keys($value), $allowed) === [];
    }
}
