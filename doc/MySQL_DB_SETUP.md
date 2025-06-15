# PrivateBin MySQL Database Setup

This document provides instructions for setting up a MySQL (or MariaDB) database for use with PrivateBin, including manual table creation steps.

## Prerequisites

1.  **MySQL Server**: Access to a running MySQL or MariaDB server.
2.  **Database**: An empty database created on your MySQL server. For example, `privatebin_db`.
3.  **User Account**: A MySQL user account that has permissions to connect to the database.
    *   For PrivateBin's automatic table creation and normal operation, this user will need at least `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX` permissions on the database.
    *   If you plan to create tables manually (see below), the user will only need `SELECT`, `INSERT`, `UPDATE`, `DELETE` permissions for normal operation after tables are created.

## Configuration (`cfg/conf.php`)

To configure PrivateBin to use your MySQL database, you need to create or edit the `cfg/conf.php` file in your PrivateBin installation directory. Add or modify the following sections:

```ini
[model]
class = "Database"

[model_options]
dsn = "mysql:host=your_mysql_host;port=3306;dbname=your_database_name;charset=utf8mb4"
usr = "your_mysql_username"
pwd = "your_mysql_password"
; tbl = "pb_" ; Optional: define a custom table prefix. Defaults to 'pb_' if not set.
; PDO options:
; Use integer keys for PDO constants. Example: 1002 for PDO::MYSQL_ATTR_INIT_COMMAND
opt[1002] = "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci" ; Ensures UTF8MB4 connection. The Database class will also try to append ANSI_QUOTES to sql_mode.
opt[12] = true ; PDO::ATTR_PERSISTENT (recommended for performance)
```

Replace `your_mysql_host`, `your_database_name`, `your_mysql_username`, and `your_mysql_password` with your actual MySQL server details and credentials. The `charset=utf8mb4` in the DSN is highly recommended for full Unicode support.

## Automatic Table Creation

If the MySQL user specified in `cfg/conf.php` has sufficient permissions (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`), PrivateBin will attempt to automatically create the necessary tables when it first connects to an empty database or if the tables are missing.

## Manual Table Creation

If you prefer to create the database tables manually, or if your database user does not have `CREATE TABLE` permissions, you can use the following SQL statements. Execute these in your chosen MySQL database (e.g., `privatebin_db`).

**Important Notes:**
*   The default table prefix is `pb_`. If you configure a different prefix using the `tbl` option in `[model_options]`, you must change `pb_` in the statements below to match your chosen prefix.
*   These statements use `IF NOT EXISTS` to prevent errors if the tables already exist.
*   Ensure your database's default character set is `utf8mb4` and collation is `utf8mb4_unicode_ci` for best compatibility.

```sql
-- Main table for paste data
CREATE TABLE IF NOT EXISTS `pb_paste` (
  `dataid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `data` LONGBLOB, -- Stores the encrypted paste content (v2 format) or attachment (v1 format)
  `expiredate` INT DEFAULT NULL,
  `opendiscussion` TINYINT(1) DEFAULT 0,
  `burnafterreading` TINYINT(1) DEFAULT 0,
  `meta` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL, -- Stores JSON metadata: v1 formatter, v1 server salt, v2 salt, etc.
  `attachment` LONGBLOB DEFAULT NULL, -- Stores encrypted attachment data (v1 format)
  `attachmentname` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL, -- Stores encrypted attachment name (v1 format)
  PRIMARY KEY (`dataid`),
  INDEX `idx_paste_expiredate` (`expiredate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for comments
CREATE TABLE IF NOT EXISTS `pb_comment` (
  `dataid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `pasteid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `parentid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `data` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, -- Encrypted comment text
  `nickname` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL, -- Encrypted nickname
  `vizhash` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL, -- vizhash or identicon data (encrypted in v1, raw data URI in v2)
  `postdate` INT NOT NULL,
  PRIMARY KEY (`dataid`),
  INDEX `idx_comment_pasteid` (`pasteid`),
  INDEX `idx_comment_parentid` (`parentid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for configuration settings (e.g., server salt, version)
CREATE TABLE IF NOT EXISTS `pb_config` (
  `id` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, -- Setting key (e.g., "VERSION", "SALT")
  `value` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL, -- Setting value
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Table Explanations (Reflecting `Database.php` storage model)

*   **`pb_paste`**:
    *   `dataid`: Unique identifier for the paste (16 character hex).
    *   `data`: For version 2 pastes, this stores the full JSON-encoded, encrypted paste structure (including `ct` and `adata`). For version 1 pastes, it stored the encrypted paste text.
    *   `expiredate`: Timestamp (Unix epoch) of when the paste is set to expire. `0` means "never expires".
    *   `opendiscussion`: Boolean (0 or 1) indicating if discussions are open (used in v1 format, v2 stores this in `adata` which is part of the `data` column's JSON).
    *   `burnafterreading`: Boolean (0 or 1) indicating if paste should be burned after reading (used in v1 format, v2 stores this in `adata`).
    *   `meta`: JSON string storing paste metadata. For v2 pastes, this primarily stores the `salt`. For v1, it could store formatter, server salt, etc.
    *   `attachment`: Stores encrypted attachment data (primarily for v1 format, as v2 embeds attachments in the main `data` JSON).
    *   `attachmentname`: Stores encrypted attachment name (primarily for v1 format).

*   **`pb_comment`**:
    *   `dataid`: Unique identifier for the comment (16 character hex).
    *   `pasteid`: ID of the paste this comment belongs to.
    *   `parentid`: ID of the parent comment if this is a reply (can be the `pasteid` for a top-level comment).
    *   `data`: For version 2 comments, this stores the full JSON-encoded, encrypted comment structure. For v1, it stored the encrypted comment text.
    *   `nickname`: Stores encrypted nickname (v1) or is part of the encrypted `data` (v2). The column is kept for historical reasons and potential direct use.
    *   `vizhash`: Stores vizhash/identicon data (encrypted in v1, raw data URI in v2 metadata, which is part of encrypted `data`).
    *   `postdate`: Timestamp (Unix epoch) of when the comment was posted. This is used as the primary sort key for comments.

*   **`pb_config`**:
    *   `id`: Name/key of the configuration setting (e.g., "VERSION", "SALT", "TRAFFIC_LIMITER"). Keys are uppercased by the application.
    *   `value`: Value of the configuration setting.

After running these SQL commands (if choosing manual setup) and configuring `cfg/conf.php`, PrivateBin should be able to use your MySQL database.
```
