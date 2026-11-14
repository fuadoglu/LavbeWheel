<?php

declare(strict_types=1);

namespace Lavbe\Api\Domain;

use Normalizer;

final class WheelSemanticValidator
{
    /** Validate non-structural invariants in the normative shared order. */
    public function validate(array $wheel): string
    {
        $entries = $wheel['entries'];
        $ids = array_column($entries, 'id');
        if (count($ids) !== count(array_unique($ids))) {
            return 'DUPLICATE_ENTRY_ID';
        }
        foreach ($entries as $entry) {
            if ($this->graphemeLength($entry['label']) > 120) {
                return 'LABEL_TOO_LONG';
            }
        }
        if ($this->graphemeLength($wheel['title']) > 80) {
            return 'TITLE_TOO_LONG';
        }
        if ($wheel['tool'] === 'numbers') {
            $range = $wheel['range'] ?? null;
            if ($range === null || $range['min'] > $range['max'] || $range['max'] - $range['min'] + 1 > 10000) {
                return 'INVALID_RANGE';
            }
        }
        $active = array_values(array_filter($entries, static fn (array $entry): bool => $entry['active']));
        $activeIds = array_column($active, 'id');
        if ($wheel['tool'] === 'teams') {
            $invalidWeights = array_filter($active, static fn (array $entry): bool => $entry['weight'] !== 1);
            if ($wheel['teamCount'] < 2 || $wheel['teamCount'] > count($active) || $invalidWeights !== []) {
                return 'INVALID_TEAM_COUNT';
            }
        }
        if ($wheel['tool'] === 'bottle') {
            $seats = $wheel['seats'] ?? [];
            $sameSet = count($seats) === count($activeIds)
                && count(array_unique($seats)) === count($seats)
                && count(array_diff($seats, $activeIds)) === 0
                && count(array_diff($activeIds, $seats)) === 0;
            if (!$sameSet || count($activeIds) < 2 || count($activeIds) > 20) {
                return 'INVALID_SEATS';
            }
        }
        $invalidWeight = $wheel['tool'] !== 'weighted'
            && count(array_filter($entries, static fn (array $entry): bool => $entry['weight'] !== 1)) > 0;
        $invalidCycle = $wheel['tool'] === 'weighted' && $wheel['mode'] === 'shuffled-cycle';
        if ($invalidWeight || $invalidCycle) {
            return 'INVALID_WEIGHT_MODE';
        }
        if ($wheel['tool'] !== 'numbers' && count($active) === 0) {
            return 'NO_ACTIVE_ENTRIES';
        }
        return 'OK';
    }

    public function normalizeForStorage(array $wheel): array
    {
        $wheel['title'] = Normalizer::normalize($wheel['title'], Normalizer::FORM_C);
        foreach ($wheel['entries'] as &$entry) {
            $entry['label'] = Normalizer::normalize($entry['label'], Normalizer::FORM_C);
        }
        unset($entry);
        return $wheel;
    }

    private function graphemeLength(string $value): int
    {
        $normalized = Normalizer::normalize($value, Normalizer::FORM_C);
        $length = grapheme_strlen($normalized);
        if ($length === false) {
            throw new \InvalidArgumentException('Invalid UTF-8 string');
        }
        return $length;
    }
}
