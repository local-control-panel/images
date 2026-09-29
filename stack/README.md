# PHP application stack

The Compose stack supplies ingress, PHP runtime pools, MariaDB, optional
PostgreSQL and Meilisearch, and Valkey. A CMS is an application deployed into a
site runtime, not another copy of the whole stack. The control panel currently
automates WordPress installation; its Drupal support is read-only diagnostics,
and Joomla detection is read-only. See the
[control panel application driver plan](https://github.com/local-control-panel/docs/blob/main/website-control-panel/devdocs/application-drivers.md)
before adding CMS-specific provisioning here.

## Before enabling a CMS site

1. Select a PHP runtime version supported by that CMS release and check its
   required extensions in the chosen runtime image. Do not infer support from
   the image tag alone.
2. Set the public document root to the CMS's actual web directory. A Composer
   project may have private code and `vendor/` above that directory; the site
   process must be able to read those files while the web server serves only
   the public root. The control panel's current `open_basedir` uses the public
   root, so such layouts need a project-root-aware site contract first.
3. Translate the CMS's web-server rules into the generated per-site Caddy
   configuration. Apache `.htaccess` files are not applied by Caddy. Check
   front-controller routing, sensitive-file denial, and upload directories.
4. Provision a dedicated database and least-privilege user. For Drupal with
   PostgreSQL, enable `pg_trgm` in that site's database. Configure cache,
   cron, queues, and writable/private directories per application rather than
   enabling them for every site.
5. Prove the installation and update path with a real site: clean URLs,
   uploads, cache invalidation, scheduled jobs, backup/restore, and rollback.

| Application | Likely public root | Stack prerequisites | Current control-panel state |
| --- | --- | --- | --- |
| WordPress | Site root | PHP, MariaDB; Valkey is optional | Install and operations available |
| Drupal Composer project | `web/` | Supported PHP/DB versions, Composer build, project-root access, CMS Caddy rules | Detection and diagnostics only |
| Joomla | Installation root | Supported PHP/DB versions, CMS Caddy rules and writable paths | Detection only |
| Laravel and similar PHP apps | `public/` | Composer build, project-root access, app-specific queue/scheduler | Generic PHP site only |

Do not enable immutable cache headers for assets whose filenames stay the same
after an update. The generated per-site runtime configuration currently needs
a reviewed cache policy before a CMS-specific deployment profile is declared
ready.

Upstream requirements: [Drupal PHP](https://www.drupal.org/docs/getting-started/system-requirements/php-requirements),
[Drupal databases](https://www.drupal.org/docs/getting-started/system-requirements/database-server-requirements),
[Drupal web server](https://www.drupal.org/docs/getting-started/system-requirements/web-server-requirements),
and [Joomla 5.4 technical requirements](https://manual.joomla.org/docs/5.4/get-started/technical-requirements/).
