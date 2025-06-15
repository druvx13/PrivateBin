# Installation

## TL;DR

Download the
[latest release archive](https://github.com/PrivateBin/PrivateBin/releases/latest)
(with the link labelled as "Source code (…)") and extract it in your web hosts
folder where you want to install your PrivateBin instance. We try to provide a
mostly safe default configuration, but we urge you to check the
[security section](#hardening-and-security) below and the
[configuration options](#configuration) to adjust as you see fit.

**NOTE:** See our [FAQ entry on securely downloading release files](https://github.com/PrivateBin/PrivateBin/wiki/FAQ#how-can-i-securely-clonedownload-your-project)
for more information.

**NOTE:** There are Ansible roles available for installing and configuring PrivateBin on your server. You can choose from the following options:

- [Podman Rootless - PrivateBin by @voidquark](https://galaxy.ansible.com/ui/standalone/roles/voidquark/privatebin/)  ([Github source code](https://github.com/voidquark/privatebin)): Simplifies the deployment and management of a secure PrivateBin service using a rootless Podman container. Key features include root-less deployment, ensuring security within a user namespace, idempotent deployment for consistent state, out-of-the-box setup for Red Hat systems, and the flexibility to customize PrivateBin configurations. It has been tested on EL9.

- [Config Configuration - PrivateBin by @e1mo](https://galaxy.ansible.com/ui/standalone/roles/e1mo/privatebin/) ([Github source code](https://git.sr.ht/~e1mo/ansible-role-privatebin)): Deploy PrivateBin configuration to disk with a customized configuration.

### Minimal Requirements

- PHP version 8.2 or above
- GD extension (when using identicon or vizhash icons, jdenticon works without it)
- zlib extension
- Composer for installing PHP dependencies.
- JavaScript dependencies are bundled with releases. For development or custom builds, Node.js/npm may be required.
- Some disk space or a database supported by [PDO](https://php.net/manual/book.pdo.php) (MySQL 5.7.8+/MariaDB 10.2.2+, PostgreSQL 9.4+, SQLite 3.7.11+ recommended).
- Ability to create files and folders in the installation directory and the PATH defined in `index.php` (if using filesystem storage).
- A modern web browser with JavaScript and WebAssembly support (for zlib compression/decompression).

## Hardening and Security

### Changing the Path

In the index.php you can define a different `PATH`. This is useful to secure
your installation. You can move the utilities, configuration, data files,
templates and PHP libraries (directories bin, cfg, doc, data, lib, tpl, tst and
vendor) outside of your document root. This new location must still be
accessible to your webserver and PHP process (see also
[open_basedir setting](https://secure.php.net/manual/en/ini.core.php#ini.open-basedir)).

> #### PATH Example
> Your PrivateBin installation lives in a subfolder called "paste" inside of
> your document root. The URL looks like this:
> http://example.com/paste/
>
> The full path of PrivateBin on your webserver is:
> /srv/example.com/htdocs/paste
>
> When setting the path like this:
> define('PATH', '../../secret/privatebin/');
>
> PrivateBin will look for your includes and data here:
> /srv/example.com/secret/privatebin

### Changing the config path only

In situations where you want to keep the PrivateBin static files separate from the
rest of your data, or you want to reuse the installation files on multiple vhosts,
you may only want to change the `conf.php`. In this case, you can set the
`CONFIG_PATH` environment variable to the absolute path to the directory containing the `conf.php` file.
This can be done in your web server's virtual host config, the PHP config, or in
the index.php, if you choose to customize it.

Note that your PHP process will need read access to the configuration file,
wherever it may be.

> #### CONFIG_PATH example
> Setting the value in an Apache Vhost:
> SetEnv CONFIG_PATH /var/lib/privatebin/
>
> In a php-fpm pool config:
> env[CONFIG_PATH] = /var/lib/privatebin/
>
> In the index.php, near the top:
> putenv('CONFIG_PATH=/var/lib/privatebin/');

### Transport security

When setting up PrivateBin, also set up HTTPS, if you haven't already. Without
HTTPS PrivateBin is not secure, as the JavaScript or WebAssembly files could be
manipulated during transmission. For more information on this, see our
[FAQ entry on HTTPS setup recommendations](https://github.com/PrivateBin/PrivateBin/wiki/FAQ#how-should-i-setup-https).

### File-level permissions

After completing the installation, you should make sure, that other users on the
system cannot read the config file or the `data/` directory, as – depending on
your configuration – potentially sensitive information may be stored in there.

See our [FAQ entry on permissions](https://github.com/PrivateBin/PrivateBin/wiki/FAQ#what-are-the-recommended-file-and-folder-permissions-for-privatebin)
for a detailed guide on how to "harden" access to files and folders.

## Configuration

In the file `cfg/conf.php` you can configure PrivateBin. A `cfg/conf.sample.php`
is provided containing all options and their default values. You can copy it to
`cfg/conf.php` and change it as needed. Alternatively you can copy it anywhere
and set the `CONFIG_PATH` environment variable (see above notes). The config
file is divided into multiple sections, which are enclosed in square brackets.

In the `[main]` section you can enable or disable the discussion feature, set
the limit of stored pastes and comments in bytes. The `[traffic]` section lets
you set a time limit in seconds. Users may not post more often then this limit
to your PrivateBin installation.

More details can be found in the
[configuration documentation](https://github.com/PrivateBin/PrivateBin/wiki/Configuration).

Subresource Integrity (SRI) hashes for JavaScript files are managed in
`lib/Configuration.php` by default. If you customize `cfg/conf.php`, you can
override these. If you manually update any JavaScript files or use a CDN, you
will need to update these hashes. The set of JavaScript files has been updated;
jQuery and legacy browser support scripts have been removed, and some libraries
(DOMPurify, Showdown) have new filenames (e.g., `purify.js`, `showdown.js`).

## Advanced installation

### Web server configuration

A `robots.txt` file is provided in the root dir of PrivateBin. It disallows all
robots from accessing your pastes. It is recommend to place it into the root of
your web directory if you have installed PrivateBin in a subdirectory. Make sure
to adjust it, so that the file paths match your installation. Of course also
adjust the file, if you already use a `robots.txt`.

A `.htaccess.disabled` file is provided in the root dir of PrivateBin. It blocks
some known robots and link-scanning bots. If you use Apache, you can rename the
file to `.htaccess` to enable this feature. If you use another webserver, you
have to configure it manually to do the same.

### On using Cloudflare

If you want to use PrivateBin behind Cloudflare, make sure you have disabled the
Rocket loader and unchecked "Javascript" for Auto Minify, found in your domain
settings, under "Speed". More information can be found in our
[FAQ entry on Cloudflare related issues](https://github.com/PrivateBin/PrivateBin/wiki/FAQ#user-content-how-to-make-privatebin-work-when-using-cloudflare-for-ddos-protection).

### Using a Database Instead of Flat Files

In the configuration file the `[model]` and `[model_options]` sections let you
configure your favourite way of storing the pastes and discussions on your
server.

`Filesystem` is the default model, which stores everything in files in the
data folder. This is the recommended setup for most sites on single hosts.

Under high load, in distributed setups or if you are not allowed to store files
locally, you might want to switch to the `Database` model. This lets you
store your data in a database. Most databases supported by
[PDO](https://secure.php.net/manual/en/book.pdo.php) may be used. Automatic table
creation is provided for `pdo_mysql` (MySQL 5.7.8+/MariaDB 10.2.2+), `pdo_pgsql`
(PostgreSQL 9.4+), `pdo_sqlite` (SQLite 3.7.11+), and older versions may support
`pdo_ibm`, `pdo_informix`, `pdo_mssql`, `pdo_oci`. You may want to provide a table
prefix if you have to share the PrivateBin database with another application.
The table prefix option is called `tbl` in `[model_options]`.

> #### Note
> The `Database` model is well-tested with recent versions of MariaDB/MySQL,
> PostgreSQL, and SQLite. Using SQLite in a high-traffic production environment
> is generally not recommended. If you gain experience running PrivateBin on other
> RDBMS, please let us know.

**Configuring for MySQL/MariaDB:**

To use MySQL or MariaDB, set the following in your `cfg/conf.php`:

```ini
[model]
class = "Database"

[model_options]
dsn = "mysql:host=your_mysql_host;port=3306;dbname=your_mysql_dbname;charset=utf8mb4"
usr = "your_mysql_user"
pwd = "your_mysql_password"
tbl = "pb_" ; This is the default prefix if not specified.
; PDO options:
; Set character set and collation, and ensure ANSI_QUOTES for SQL compatibility.
; The Database class will attempt to add ANSI_QUOTES to the sql_mode if not already present.
opt[1002] = "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci" ; 1002 is PDO::MYSQL_ATTR_INIT_COMMAND
opt[12] = true ; 12 is PDO::ATTR_PERSISTENT
```

The database user (`your_mysql_user`) requires the following privileges:
- **Normal Operation**: `SELECT`, `INSERT`, `DELETE` on the PrivateBin tables (`pb_paste`, `pb_comment`, `pb_config`).
- **Initial Setup/Upgrades**: `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX` on the database, and `UPDATE` on the `pb_config` table if you want PrivateBin to manage table creation and updates automatically.

If PrivateBin creates the tables, it will use `utf8mb4` character set for full Unicode support.
The required tables are `pb_paste`, `pb_comment`, and `pb_config` (assuming the default `pb_` prefix).

**Example MySQL Table Schema (if creating manually):**
(Replace `pb_` with your chosen prefix if different)
```sql
CREATE TABLE `pb_paste` (
    `dataid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `data` LONGBLOB,
    `expiredate` INT,
    `opendiscussion` TINYINT(1),
    `burnafterreading` TINYINT(1),
    `meta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    `attachment` LONGBLOB,
    `attachmentname` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    PRIMARY KEY (`dataid`),
    INDEX `idx_paste_expiredate` (`expiredate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pb_comment` (
    `dataid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `pasteid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin,
    `parentid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin,
    `data` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    `nickname` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    `vizhash` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    `postdate` INT,
    PRIMARY KEY (`dataid`),
    INDEX `idx_comment_pasteid` (`pasteid`),
    INDEX `idx_comment_parentid` (`parentid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pb_config` (
    `id` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `value` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PrivateBin will attempt to insert its version into pb_config, e.g.:
-- INSERT INTO `pb_config` (`id`, `value`) VALUES('VERSION', '1.8.0'); -- Adjust version as appropriate
```

In **PostgreSQL**, the `data`, `attachment`, `nickname` and `vizhash` columns
need to be `TEXT` and not `BLOB` or `MEDIUMBLOB`/`LONGBLOB`.

In **Oracle**, the `data`, `attachment`, `nickname` and `vizhash` columns need
to be `CLOB` and not `BLOB` or `MEDIUMBLOB`, the `id` column in the `config`
table needs to be `VARCHAR2(16)` and the `meta` column in the `paste` table
and the `value` column in the `config` table need to be `VARCHAR2(4000)`.

### Cloud Storage Backends

Due to the large size of the respective cloud SDKs required for these, we didn't
include these in the `vendor` directory shipped in our release archives. To use
these in your manual installation, you will need [composer installed](https://getcomposer.org/)
and require the used library (see instructions below).

This is not required if using the dedicated container images that have these SDKs
preinstalled.

#### Using Google Cloud Storage
If you want to deploy PrivateBin in a serverless manner in the Google Cloud, you
can choose the `GoogleCloudStorage` as backend.

To use this backend, you first have to install the SDK from the installation
directory of PrivateBin:

```console
composer require --no-update google/cloud-storage
composer update --no-dev --optimize-autoloader
```

You have to create a GCS bucket and specify the name as the model option `bucket`.
Alternatively, you can set the name through the environment variable `PRIVATEBIN_GCS_BUCKET`.

The default prefix for pastes stored in the bucket is `pastes`. To change the
prefix, specify the option `prefix`.

Google Cloud Storage buckets may be significantly slower than a `FileSystem` or
`Database` backend. The big advantage is that the deployment on Google Cloud
Platform using Google Cloud Run is easy and cheap.

#### Using S3 Storage
Similar to Google Cloud Storage, you can choose S3 as storage backend. It uses
the AWS SDK for PHP, but can also talk to a Rados gateway as part of a Ceph
cluster.

To use this backend, you first have to install the SDK from the installation
directory of PrivateBin:

```console
composer require --no-update aws/aws-sdk-php
composer update --no-dev --optimize-autoloader
```

You have to create an S3 bucket on the Ceph cluster before using the S3 backend.

In the `[model]` section of cfg/conf.php, set `class` to `S3Storage`.

You can set any combination of the following options in the `[model_options]`
section:

  * region
  * version
  * endpoint
  * bucket
  * prefix
  * accesskey
  * secretkey
  * use_path_style_endpoint

By default, prefix is empty. If set, the S3 backend will place all PrivateBin
data beneath this prefix.

For AWS, you have to provide at least `region`, `bucket`, `accesskey`, and
`secretkey`.

For Ceph, follow this example:

```
region = ""
version = "2006-03-01"
endpoint = "https://s3.my-ceph.invalid"
use_path_style_endpoint = true
bucket = "my-bucket"
accesskey = "my-rados-user"
secretkey = "my-rados-pass"
```
