<?php // <?php prevents direct access
/*
PrivateBin configuration file.
*/

[main]
name = "PrivateBin"
; Uncomment and set to the full URL of your PrivateBin instance, including trailing slash
; basepath = "https://privatebin.example.com/"
discussion = true
opendiscussion = false
password = true
fileupload = false
burnafterreadingselected = false
defaultformatter = "plaintext"
sizelimit = 10485760
templateselection = false
template = "bootstrap5" ; Using bootstrap5 as per previous updates
languageselection = false
icon = "identicon"

[expire]
default = "1week"

[expire_options]
5min = 300
10min = 600
1hour = 3600
1day = 86400
1week = 604800
1month = 2592000
1year = 31536000
never = 0

[formatter_options]
plaintext = "Plain Text"
syntaxhighlighting = "Source Code"
markdown = "Markdown"

[model]
class = "Database"

[model_options]
dsn = "mysql:host=sql101.byetcluster.com;port=3306;dbname=nhyfe_39084272_pb;charset=utf8mb4"
usr = "nhyfe_39084272"
pwd = "8914e3f29a23868"
; tbl = "pb_" ; Optional: specify table prefix if desired, default is 'pb_' via _sanitizeIdentifier in Database.php
opt[] = "PDO::MYSQL_ATTR_INIT_COMMAND=SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
opt[] = "PDO::ATTR_PERSISTENT=true" ; Example of another option

[database]
type = "mysql"
host = "sql101.byetcluster.com"
port = 3306
user = "nhyfe_39084272"
password = "8914e3f29a23868"
dbname = "nhyfe_39084272_pb"
; table_prefix = "pb_" ; This is not a standard option, prefixing is handled by the class

[traffic]
limit = 10
gcprobability = 10

[purge]
limit = 300
batchsize = 10

; SRI hashes would go here if any JS files were customized by the user.
; Since we are using stock libraries (or placeholders for them),
; and core privatebin.js which would also need a new SRI after its own changes,
; we leave this empty or managed by the Configuration.php defaults.
; [sri]
; js/privatebin.js = "sha512-..."
; js/purify.js = "sha512-..."
; js/showdown.js = "sha512-..."
; ... other files
