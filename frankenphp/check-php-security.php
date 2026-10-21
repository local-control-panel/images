<?php
/** Minimum releases fixing CVE-2026-109618 and CVE-2026-109619. */
function wcpPhpSecurityPatched(string $version): bool
{
    $minimums = ['8.3' => '8.3.36', '8.4' => '8.4.27', '8.5' => '8.5.12'];
    if (!preg_match('/^(\d+\.\d+)\./', $version, $match)) {
        return false;
    }
    return isset($minimums[$match[1]]) && version_compare($version, $minimums[$match[1]], '>=');
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (!wcpPhpSecurityPatched(PHP_VERSION)) {
        fwrite(STDERR, 'Unsupported or unpatched PHP: ' . PHP_VERSION . PHP_EOL);
        exit(1);
    }
    echo 'PHP security baseline verified: ' . PHP_VERSION . PHP_EOL;
}
