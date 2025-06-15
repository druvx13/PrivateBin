<?php declare(strict_types=1);
use PrivateBin\I18n;
$isCpct = substr($template, 9, 8) === '-compact';
$isDark = substr($template, 9, 5) === '-dark';
$isPage = substr($template, -5) === '-page';
?><!DOCTYPE html>
<html lang="<?php echo I18n::getLanguage(); ?>"<?php echo I18n::isRtl() ? ' dir="rtl"' : ''; ?><?php if ($isDark) echo ' data-bs-theme="dark"'; ?>>
	<head>
		<meta charset="utf-8" />
		<meta http-equiv="Content-Security-Policy" content="<?php echo I18n::encode($CSPHEADER); ?>">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="robots" content="noindex" />
		<meta name="google" content="notranslate">
		<title><?php echo I18n::_($NAME); ?></title>
		<link type="text/css" rel="stylesheet" href="css/bootstrap5/bootstrap-5.3.3.css" />
		<link type="text/css" rel="stylesheet" href="css/bootstrap5/privatebin.css?<?php echo rawurlencode($VERSION); ?>" />
<?php
if ($SYNTAXHIGHLIGHTING) :
?>
		<link type="text/css" rel="stylesheet" href="css/prettify/prettify.css?<?php echo rawurlencode($VERSION); ?>" />
<?php
    if (!empty($SYNTAXHIGHLIGHTINGTHEME)) :
?>
		<link type="text/css" rel="stylesheet" href="css/prettify/<?php echo rawurlencode($SYNTAXHIGHLIGHTINGTHEME); ?>.css?<?php echo rawurlencode($VERSION); ?>" />
<?php
    endif;
endif;
?>
		<noscript><link type="text/css" rel="stylesheet" href="css/noscript.css" /></noscript>
<?php
if ($QRCODE) :
?>
		<?php $this->_scriptTag('js/kjua-0.9.0.js', 'async'); ?>
<?php
endif;
if ($ZEROBINCOMPATIBILITY) :
?>
		<?php $this->_scriptTag('js/base64-1.7.js', 'async'); ?>
<?php
endif;
?>
		<?php $this->_scriptTag('js/zlib-1.3.1.js', 'async'); ?>
		<?php $this->_scriptTag('js/base-x-4.0.0.js', 'defer'); ?>
		<?php $this->_scriptTag('js/rawinflate-0.3.js', 'defer'); ?>
<?php
if ($SYNTAXHIGHLIGHTING) :
?>
		<?php $this->_scriptTag('js/prettify.js', 'async'); ?>
<?php
endif;
if ($MARKDOWN) :
?>
		<?php $this->_scriptTag('js/showdown.js', 'async'); ?>
<?php
endif;
?>
		<?php $this->_scriptTag('js/purify.js', 'async'); ?>
		<?php $this->_scriptTag('js/privatebin.js', 'defer'); ?>
		<!-- icon -->
		<link rel="apple-touch-icon" href="<?php echo I18n::encode($BASEPATH); ?>img/apple-touch-icon.png" sizes="180x180" />
		<link rel="icon" type="image/png" href="img/favicon-32x32.png" sizes="32x32" />
		<link rel="icon" type="image/png" href="img/favicon-16x16.png" sizes="16x16" />
		<link rel="manifest" href="manifest.json?<?php echo rawurlencode($VERSION); ?>" />
		<link rel="mask-icon" href="img/safari-pinned-tab.svg" color="#ffcc00" />
		<link rel="shortcut icon" href="img/favicon.ico">
		<meta name="msapplication-config" content="browserconfig.xml">
		<meta name="theme-color" content="#ffe57e" />
		<!-- Twitter/social media cards -->
		<meta name="twitter:card" content="summary" />
		<meta name="twitter:title" content="<?php echo I18n::_('Encrypted note on %s', I18n::_($NAME)) ?>" />
		<meta name="twitter:description" content="<?php echo I18n::_('Visit this link to see the note. Giving the URL to anyone allows them to access the note, too.') ?>" />
		<meta name="twitter:image" content="<?php echo I18n::encode($BASEPATH); ?>img/apple-touch-icon.png" />
		<meta property="og:title" content="<?php echo I18n::_($NAME); ?>" />
		<meta property="og:site_name" content="<?php echo I18n::_($NAME); ?>" />
		<meta property="og:description" content="<?php echo I18n::_('Visit this link to see the note. Giving the URL to anyone allows them to access the note, too.') ?>" />
		<meta property="og:image" content="<?php echo I18n::encode($BASEPATH); ?>img/apple-touch-icon.png" />
		<meta property="og:image:type" content="image/png" />
		<meta property="og:image:width" content="180" />
		<meta property="og:image:height" content="180" />
	</head>
	<body role="document" data-compression="<?php echo rawurlencode($COMPRESSION); ?>"<?php
$class = array();
if ($isCpct) {
    $class[] = 'navbar-spacing';
}
if ($isDark) {
    $class[] = 'dark-theme';
}
if (count($class)) {
    echo ' class="', implode(' ', $class), '"';
}
?>>
		<div id="passwordmodal" tabindex="-1" class="modal fade" role="dialog" aria-hidden="true">
			<div class="modal-dialog" role="document">
				<div class="modal-content">
					<div class="modal-body">
						<form id="passwordform" role="form">
							<div class="mb-3">
								<label for="passworddecrypt"><?php echo I18n::_('Please enter the password for this paste:') ?></label>
								<input id="passworddecrypt" type="password" class="form-control" placeholder="<?php echo I18n::_('Enter password') ?>" required="required">
							</div>
							<button type="submit" class="btn btn-success d-block w-100"><?php echo I18n::_('Decrypt') ?></button>
						</form>
					</div>
				</div>
			</div>
		</div>
		<div id="loadconfirmmodal" tabindex="-1" class="modal fade" role="dialog" aria-hidden="true">
			<div class="modal-dialog" role="document">
				<div class="modal-content">
					<div class="modal-header">
						<h4 class="modal-title"><?php echo I18n::_('This secret message can only be displayed once. Would you like to see it now?') ?></h4>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?php echo I18n::_('Close') ?>"></button>
					</div>
					<div class="modal-body text-center">
						<button id="loadconfirm-open-now" type="button" class="btn btn-success" data-bs-dismiss="modal"><?php echo I18n::_('Yes, see it') ?></button>
					</div>
				</div>
			</div>
		</div>
<?php
if ($QRCODE) :
?>
		<div id="qrcodemodal" tabindex="-1" class="modal fade" role="dialog" aria-hidden="true">
			<div class="modal-dialog" role="document">
				<div class="modal-content">
					<div class="modal-header">
						<h4 class="modal-title"><?php echo I18n::_('QR code') ?></h4>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?php echo I18n::_('Close') ?>"></button>
					</div>
					<div class="modal-body">
						<div class="mx-auto" id="qrcode-display"></div>
					</div>
				</div>
			</div>
		</div>
<?php
endif;
if ($EMAIL) :
?>
		<div id="emailconfirmmodal" tabindex="-1" class="modal fade" role="dialog" aria-hidden="true">
			<div class="modal-dialog" role="document">
				<div class="modal-content">
					<div class="modal-header">
						<h4 class="modal-title"><?php echo I18n::_('Recipient may become aware of your timezone, convert time to UTC?') ?></h4>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="<?php echo I18n::_('Close') ?>"></button>
					</div>
					<div class="modal-body row">
						<div class="col-12 col-md-6 mb-2 mb-md-0">
							<button id="emailconfirm-timezone-current" type="button" class="btn btn-danger d-block w-100"><?php echo I18n::_('Use Current Timezone') ?></button>
						</div>
						<div class="col-12 col-md-6 text-md-end">
							<button id="emailconfirm-timezone-utc" type="button" class="btn btn-success d-block w-100"><?php echo I18n::_('Convert To UTC') ?></button>
						</div>
					</div>
				</div>
			</div>
		</div>
<?php
endif;
?>
		<nav class="navbar navbar-expand-lg <?php echo $isDark ? 'navbar-dark bg-dark' : 'navbar-light bg-light'; ?> <?php echo $isCpct ? 'fixed-top' : 'sticky-top'; ?>">
<div class="container-fluid">
			<a class="reloadlink navbar-brand" href="">
				<img alt="<?php echo I18n::_($NAME); ?>" src="img/icon.svg" width="38" />
			</a>
			<button type="button" class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#navbar" aria-expanded="false" aria-controls="navbar">
				<span class="navbar-toggler-icon"></span>
			</button>
			<div id="navbar" class="collapse navbar-collapse">
				<ul class="navbar-nav me-auto mb-2 mb-lg-0">
					<li id="loadingindicator" class="nav-item visually-hidden">
						<span class="navbar-text"><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> <?php echo I18n::_('Loading…'); ?></span>
					</li>
					<li class="nav-item">
						<button id="retrybutton" type="button" class="reloadlink visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'primary'; ?> nav-link">
							<?php echo I18n::_('Retry'); ?>
						</button>
					</li>
					<li class="nav-item">
<?php
if ($isPage) :
?>
						<button id="sendbutton" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'primary'; ?> nav-link">
							<?php echo I18n::_('Create');
else :
?>
						<button id="newbutton" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('New');
endif;
?>
						</button>
					</li>
					<li class="nav-item">
						<button id="clonebutton" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('Clone'); ?>
						</button>
					</li>
					<li class="nav-item">
						<button id="rawtextbutton" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('Raw text'); ?>
						</button>
					</li>
					<li class="nav-item">
						<button id="downloadtextbutton" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('Save paste'); ?>
						</button>
					</li>
<?php
if ($EMAIL) :
?>
					<li class="nav-item">
						<button id="emaillink" type="button" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('Email'); ?>
						</button>
					</li>
<?php
endif;
if ($QRCODE) :
?>
					<li class="nav-item">
						<button id="qrcodelink" type="button" data-bs-toggle="modal" data-bs-target="#qrcodemodal" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?> nav-link">
							<?php echo I18n::_('QR code'); ?>
						</button>
					</li>
<?php
endif;
?>
					<li class="nav-item dropdown">
						<select id="pasteExpiration" name="pasteExpiration" class="form-select visually-hidden">
<?php
foreach ($EXPIRE as $key => $value) :
?>
							<option value="<?php echo $key; ?>"<?php
    if ($key == $EXPIREDEFAULT) :
?> selected="selected"<?php
    endif;
?>><?php echo $value; ?></option>
<?php
endforeach;
?>
						</select>
						<a id="expiration" href="#" class="nav-link visually-hidden dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo I18n::_('Expires'); ?>: <span id="pasteExpirationDisplay"><?php echo $EXPIRE[$EXPIREDEFAULT]; ?></span></a>
						<ul class="dropdown-menu">
<?php
foreach ($EXPIRE as $key => $value) :
?>
							<li>
								<a class="dropdown-item" href="#" data-expiration="<?php echo $key; ?>">
									<?php echo $value; ?>
								</a>
							</li>
<?php
endforeach;
?>
						</ul>
					</li>
<?php
if ($isCpct) :
?>
					<li class="nav-item dropdown">
						<a id="formatter" href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo I18n::_('Options'); ?></a>
						<ul class="dropdown-menu">
							<li id="burnafterreadingoption" class="form-check visually-hidden ms-3">
								<input class="form-check-input" type="checkbox" id="burnafterreading" name="burnafterreading"<?php
    if ($BURNAFTERREADINGSELECTED) :
?> checked="checked"<?php
    endif;
?> />
								<label class="form-check-label" for="burnafterreading">
									<?php echo I18n::_('Burn after reading'); ?>
								</label>
							</li>
<?php
    if ($DISCUSSION) :
?>
							<li id="opendiscussionoption" class="form-check visually-hidden ms-3">
								<input class="form-check-input" type="checkbox" id="opendiscussion" name="opendiscussion"<?php
        if ($OPENDISCUSSION) :
?> checked="checked"<?php
        endif;
?> />
								<label class="form-check-label" for="opendiscussion">
									<?php echo I18n::_('Open discussion'); ?>
								</label>
							</li>
<?php
    endif;
?>
							<li><hr class="dropdown-divider"></li>
							<li>
								<span class="dropdown-item-text">
									<?php echo I18n::_('Format'); ?>: <span id="pasteFormatterDisplay"><?php echo $FORMATTER[$FORMATTERDEFAULT]; ?></span>
								</span>
							</li>
<?php
    foreach ($FORMATTER as $key => $value) :
?>
							<li>
								<a class="dropdown-item" href="#" data-format="<?php echo $key; ?>">
									<?php echo $value; ?>
								</a>
							</li>
<?php
    endforeach;
?>
						</ul>
						<select id="pasteFormatter" name="pasteFormatter" class="form-select visually-hidden">
<?php
    foreach ($FORMATTER as $key => $value) :
?>
							<option value="<?php echo $key; ?>"<?php
        if ($key == $FORMATTERDEFAULT) :
?> selected="selected"<?php
        endif;
?>><?php echo $value; ?></option>
<?php
    endforeach;
?>
						</select>
					</li>
<?php
else :
?>
					<li class="nav-item">
						<div id="burnafterreadingoption" class="form-check visually-hidden my-2 ms-2">
							<input class="form-check-input" type="checkbox" id="burnafterreading" name="burnafterreading"<?php
    if ($BURNAFTERREADINGSELECTED) :
?> checked="checked"<?php
    endif;
?> />
							<label class="form-check-label" for="burnafterreading">
								<?php echo I18n::_('Burn after reading'); ?>
							</label>
						</div>
					</li>
<?php
    if ($DISCUSSION) :
?>
					<li class="nav-item">
						<div id="opendiscussionoption" class="form-check visually-hidden my-2 ms-2">
							<input class="form-check-input" type="checkbox" id="opendiscussion" name="opendiscussion"<?php
        if ($OPENDISCUSSION) :
?> checked="checked"<?php
        endif;
?> />
							<label class="form-check-label" for="opendiscussion">
								<?php echo I18n::_('Open discussion'); ?>
							</label>
						</div>
					</li>
<?php
    endif;
endif;
if ($PASSWORD) :
?>
					<li class="nav-item">
						<div id="password" class="visually-hidden my-1 ms-2">
							<input type="password" id="passwordinput" placeholder="<?php echo I18n::_('Password (recommended)'); ?>" class="form-control" size="23" />
						</div>
					</li>
<?php
endif;
if ($FILEUPLOAD) :
?>
					<li id="attach" class="nav-item visually-hidden dropdown ms-2">
						<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo I18n::_('Attach a file'); ?></a>
						<ul class="dropdown-menu">
							<li id="filewrap" class="p-2">
								<div>
									<input class="form-control" type="file" id="file" name="file" multiple />
								</div>
								<div id="dragAndDropFileName" class="form-text"><?php echo I18n::_('alternatively drag & drop a file or paste an image from the clipboard'); ?></div>
							</li>
							<li id="customattachment" class="visually-hidden"></li>
							<li>
								<a id="fileremovebutton" class="dropdown-item" href="#">
									<?php echo I18n::_('Remove attachment'); ?>
								</a>
							</li>
						</ul>
					</li>
<?php
endif;
if (!$isCpct) :
?>
					<li class="nav-item dropdown ms-2">
						<select id="pasteFormatter" name="pasteFormatter" class="form-select visually-hidden">
<?php
    foreach ($FORMATTER as $key => $value) :
?>
							<option value="<?php echo $key; ?>"<?php
        if ($key == $FORMATTERDEFAULT) :
?> selected="selected"<?php
        endif;
?>><?php echo $value; ?></option>
<?php
    endforeach;
?>
						</select>
						<a id="formatter" href="#" class="nav-link visually-hidden dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo I18n::_('Format'); ?>: <span id="pasteFormatterDisplay"><?php echo $FORMATTER[$FORMATTERDEFAULT]; ?></span></a>
						<ul class="dropdown-menu">
<?php
    foreach ($FORMATTER as $key => $value) :
?>
							<li>
								<a class="dropdown-item" href="#" data-format="<?php echo $key; ?>">
									<?php echo $value; ?>
								</a>
							</li>
<?php
    endforeach;
?>
						</ul>
					</li>
<?php
endif;
?>
				</ul>
				<ul class="navbar-nav ms-auto mb-2 mb-lg-0">
<?php
if (!empty($LANGUAGESELECTION)) :
?>
					<li id="language" class="nav-item dropdown">
						<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo $LANGUAGES[$LANGUAGESELECTION][0]; ?></a>
						<ul class="dropdown-menu dropdown-menu-end">
<?php
    foreach ($LANGUAGES as $key => $value) :
?>
							<li>
								<a class="dropdown-item" href="#" data-lang="<?php echo $key; ?>">
									<?php echo $value[0]; ?> (<?php echo $value[1]; ?>)
								</a>
							</li>
<?php
    endforeach;
?>
						</ul>
					</li>
<?php
endif;
?>
<?php
if (!empty($TEMPLATESELECTION)) :
?>
					<li id="template" class="nav-item dropdown">
						<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><?php echo I18n::_('Theme'); ?>: <?php echo $TEMPLATESELECTION; ?></a>
						<ul class="dropdown-menu dropdown-menu-end">
<?php
    foreach ($TEMPLATES as $value) :
?>
							<li>
								<a class="dropdown-item" href="#" data-template="<?php echo $value; ?>">
									<?php echo $value; ?>
								</a>
							</li>
<?php
    endforeach;
?>
						</ul>
					</li>
<?php
endif;
?>
				</ul>
			</div>
</div>
</nav>
		<main class="container mt-3 mb-3">
			<section>
<?php
if (!empty($NOTICE)) :
?>
				<div role="alert" class="alert alert-info">
					<?php echo I18n::encode($NOTICE); ?>
				</div>
<?php
endif;
?>
				<div id="remainingtime" role="alert" class="visually-hidden alert alert-info">
				</div>
<?php
if ($FILEUPLOAD) :
?>
				<div id="attachment" class="visually-hidden"></div>
<?php
endif;
?>
				<div id="status" role="alert" class="alert alert-<?php echo (bool)$ISDELETED ? 'success' : 'info'; echo empty($STATUS) ? ' visually-hidden' : '' ?>">
					<?php echo I18n::encode($STATUS); ?>
					<?php
						if ((bool)$ISDELETED):
					?>
						<button type="button" class="btn btn-secondary float-end" id="new-from-alert">
							<?php echo I18n::_('Start over'); ?>
						</button>
					<?php endif; ?>
				</div>
				<div id="errormessage" role="alert" class="<?php echo empty($ERROR) ? 'visually-hidden' : '' ?> alert alert-danger">
					<?php echo I18n::encode($ERROR); ?>
				</div>
				<noscript>
					<div id="noscript" role="alert" class="alert alert-<?php echo $isDark ? 'danger' : 'warning'; ?>">
						<?php echo I18n::_('JavaScript is required for %s to work. Sorry for the inconvenience.', I18n::_($NAME)); ?>
					</div>
				</noscript>
				<div id="oldnotice" role="alert" class="visually-hidden alert alert-danger">
					<?php echo I18n::_('%s requires a modern browser to work.', I18n::_($NAME)); ?>
					<a href="https://www.mozilla.org/firefox/">Firefox</a>,
					<a href="https://www.opera.com/">Opera</a>,
					<a href="https://www.google.com/chrome">Chrome</a>…<br />
					<span class="small"><?php echo I18n::_('For more information <a href="%s">see this FAQ entry</a>.', 'https://github.com/PrivateBin/PrivateBin/wiki/FAQ#why-does-it-show-me-the-error-privatebin-requires-a-modern-browser-to-work'); ?></span>
				</div>
<?php
if ($HTTPWARNING) :
?>
				<div id="httpnotice" role="alert" class="visually-hidden alert alert-danger">
					<?php echo I18n::_('This website is using an insecure connection! Please only use it for testing.'); ?><br />
					<span class="small"><?php echo I18n::_('For more information <a href="%s">see this FAQ entry</a>.', 'https://github.com/PrivateBin/PrivateBin/wiki/FAQ#why-does-it-show-me-an-error-about-an-insecure-connection'); ?></span>
				</div>
				<div id="insecurecontextnotice" role="alert" class="visually-hidden alert alert-danger">
					<?php echo I18n::_('Your browser may require an HTTPS connection to support the WebCrypto API. Try <a href="%s">switching to HTTPS</a>.', $HTTPSLINK); ?>
				</div>
<?php
endif;
?>
				<div id="pastesuccess" class="visually-hidden">
					<div class="btn-toolbar mb-3" role="toolbar">
						<div class="btn-group me-2 mb-2 mb-md-0" role="group">
							<button id="copyLink" type="button" class="btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?>">
								<?php echo I18n::_('Copy link') ?>
							</button>
						</div>
						<div class="btn-group mb-2 mb-md-0" role="group">
							<a href="#" id="deletelink" class="btn btn-<?php echo $isDark ? 'warning' : 'danger'; ?>">
								<?php echo I18n::_('Delete now') ?> <!-- Icon placeholder for delete -->
							</a>
						</div>
					</div>
					<div role="alert" class="alert alert-success">
						<div id="pastelink"></div>
					</div>
<?php
if (!empty($URLSHORTENER)) :
?>
					<p class="mt-3">
						<button id="shortenbutton" data-shortener="<?php echo I18n::encode($URLSHORTENER); ?>" type="button" class="btn btn-<?php echo $isDark ? 'warning' : 'primary'; ?> d-block w-100">
							<?php echo I18n::_('Shorten URL'); ?>
						</button>
					</p>
					<div role="alert" class="alert alert-danger mt-3">
						<?php echo I18n::_('URL shortener may expose your decrypt key in URL.'); ?>
					</div>
<?php
endif;
?>
				</div>
				<ul id="editorTabs" class="nav nav-tabs visually-hidden" role="tablist">
					<li class="nav-item" role="presentation"><button class="nav-link active" id="messageedit-tab" data-bs-toggle="tab" data-bs-target="#messageedit-pane" type="button" role="tab" aria-controls="messageedit-pane" aria-selected="true"><?php echo I18n::_('Editor'); ?></button></li>
					<li class="nav-item" role="presentation"><button class="nav-link" id="messagepreview-tab" data-bs-toggle="tab" data-bs-target="#messagepreview-pane" type="button" role="tab" aria-controls="messagepreview-pane" aria-selected="false"><?php echo I18n::_('Preview'); ?></button></li>
					<li class="nav-item ms-auto">
<?php
if ($isPage) :
?>
						<button id="newbutton" type="button" class="reloadlink visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'secondary'; ?>">
							<?php echo I18n::_('New');
else :
?>
						<button id="sendbutton" type="button" tabindex="2" class="visually-hidden btn btn-<?php echo $isDark ? 'warning' : 'primary'; ?>">
							<?php echo I18n::_('Create');
endif;
?>
						</button>
					</li>
				</ul>
				<div class="tab-content mt-3">
					<div class="tab-pane fade show active" id="messageedit-pane" role="tabpanel" aria-labelledby="messageedit-tab" tabindex="0">
						<div id="placeholder" class="col-md-12 visually-hidden"><?php echo I18n::_('+++ no paste text +++'); ?></div>
						<div id="attachmentPreview" class="col-md-12 text-center visually-hidden"></div>
						<h5 id="copyShortcutHint" class="col-md-12"><small id="copyShortcutHintText"></small></h5>
						<div id="prettymessage" class="col-md-12 visually-hidden position-relative">
							<button id="prettyMessageCopyBtn" class="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-1 z-1">
								<span id="copyIcon"></span> <!-- Icon placeholder for copy -->
								<span id="copySuccessIcon" class="text-success visually-hidden"></span> <!-- Icon placeholder for success -->
							</button>
							<pre id="prettyprint" class="col-md-12 prettyprint linenums:1"></pre>
						</div>
						<div id="plaintext" class="col-md-12 visually-hidden"></div>
						<div class="col-md-12 mb-3"><textarea id="message" name="message" cols="80" rows="25" tabindex="1" class="form-control visually-hidden"></textarea></div>
						<div class="col-md-12 form-check">
							<input class="form-check-input" id="messagetab" type="checkbox" tabindex="3" checked="checked" />
							<label class="form-check-label" for="messagetab">
								<?php echo I18n::_('Tabulator key serves as character (Hit <kbd>Ctrl</kbd>+<kbd>m</kbd> or <kbd>Esc</kbd> to toggle)'); ?>
							</label>
						</div>
					</div>
					<div class="tab-pane fade" id="messagepreview-pane" role="tabpanel" aria-labelledby="messagepreview-tab" tabindex="0">
						<!-- Preview content will be injected here by JS -->
					</div>
				</div>
			</section>
			<section class="container mt-3">
				<div id="discussion" class="visually-hidden">
					<h4><?php echo I18n::_('Discussion'); ?></h4>
					<div id="commentcontainer"></div>
				</div>
			</section>
			<section class="container mt-3">
				<div id="noscript" role="alert" class="alert alert-info noscript-hide">
					<?php echo I18n::_('Loading…'); ?><br />
					<span class="small"><?php echo I18n::_('In case this message never disappears please have a look at <a href="%s">this FAQ for information to troubleshoot</a>.', 'https://github.com/PrivateBin/PrivateBin/wiki/FAQ#why-does-the-loading-message-not-go-away'); ?></span>
				</div>
			</section>
			<footer class="container mt-4 pt-4 border-top">
				<div class="row">
					<h4 class="col-lg-5 col-md-12 mb-3 mb-lg-0"><?php echo I18n::_($NAME); ?> <small class="text-muted">- <?php echo I18n::_('Because ignorance is bliss'); ?></small></h4>
					<p class="col-lg-1 col-md-12 text-lg-center mb-3 mb-lg-0"><?php echo $VERSION; ?></p>
					<p id="aboutbox" class="col-lg-6 col-md-12">
						<?php echo sprintf(
                            I18n::_('%s is a minimalist, open source online pastebin where the server has zero knowledge of pasted data. Data is encrypted/decrypted %sin the browser%s using 256 bits AES.',
                                I18n::_($NAME),
                                '%s', '%s'
                            ),
                            '<i>', '</i>'), ' ', $INFO, PHP_EOL;
                        ?>
					</p>
				</div>
			</footer>
		</main>
		<div id="serverdata" class="hidden" aria-hidden="true">
			<div id="templates">
				<article id="commenttemplate" class="comment">
					<div class="commentmeta">
						<span class="nickname">name</span>
						<span class="commentdate">0000-00-00</span>
					</div>
					<div class="commentdata">c</div>
					<button class="btn btn-outline-secondary btn-sm"><?php echo I18n::_('Reply'); ?></button>
				</article>
				<p id="commenttailtemplate" class="comment">
					<button class="btn btn-outline-secondary btn-sm"><?php echo I18n::_('Add comment'); ?></button>
				</p>
				<div id="replytemplate" class="reply visually-hidden mt-3">
					<div class="mb-3">
						<input type="text" id="nickname" class="form-control" title="<?php echo I18n::_('Optional nickname…'); ?>" placeholder="<?php echo I18n::_('Optional nickname…'); ?>" />
					</div>
					<div class="mb-3">
						<textarea id="replymessage" class="replymessage form-control" cols="80" rows="7"></textarea>
					</div>
					<div id="replystatus" role="alert" class="statusmessage visually-hidden alert">
					</div>
					<button id="replybutton" class="btn btn-outline-secondary btn-sm"><?php echo I18n::_('Post comment'); ?></button>
				</div>
				<div id="attachmenttemplate" role="alert" class="attachment visually-hidden alert alert-info mt-3">
					<a class="alert-link" href="#"><?php echo I18n::_('Download attachment'); ?></a> <!-- Icon placeholder -->
				</div>
			</div>
		</div>
<?php
if ($FILEUPLOAD) :
?>
		<div id="dropzone" class="visually-hidden" tabindex="-1" aria-hidden="true"></div>
<?php
endif;
?>
		<?php $this->_scriptTag('js/bootstrap-5.3.3.js', 'defer'); ?>
	</body>
</html>
