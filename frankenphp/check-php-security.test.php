<?php
require __DIR__ . '/check-php-security.php';
foreach (['8.3.35', '8.4.26', '8.5.11', '8.4.27RC1', '8.2.35', '9.0.0', 'garbage'] as $version) {
    if (wcpPhpSecurityPatched($version)) { throw new RuntimeException('Accepted unverified version: ' . $version); }
}
foreach (['8.3.36', '8.4.27', '8.5.12', '8.4.28'] as $version) {
    if (!wcpPhpSecurityPatched($version)) { throw new RuntimeException('Rejected patched version: ' . $version); }
}
echo "PHP security baseline cases passed\n";
