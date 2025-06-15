/**
 * PrivateBin
 *
 * a zero-knowledge paste bin
 *
 * @see       {@link https://github.com/PrivateBin/PrivateBin}
 * @copyright 2012 Sébastien SAUVAGE ({@link http://sebsauvage.net})
 * @license   {@link https://www.opensource.org/licenses/zlib-license.php The zlib/libpng License}
 * @name      PrivateBin
 * @namespace
 */

// global Base64, DOMPurify, FileReader, RawDeflate, history, navigator, prettyPrint, prettyPrintOne, showdown, kjua

// main application start, called when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    'use strict';
    // run main controller
    // $.PrivateBin will be window.PrivateBin after this change
    if (window.PrivateBin && typeof window.PrivateBin.Controller !== 'undefined') {
        window.PrivateBin.Controller.init();
    }
});

window.PrivateBin = (function(RawDeflate) {
    'use strict';

    /**
     * zlib library interface
     *
     * @private
     */
    let z;

    /**
     * DOMpurify settings for HTML content
     *
     * @private
     */
     const purifyHtmlConfig = {
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|magnet):)/i,
        USE_PROFILES: {
            html: true
        }
    };

    /**
     * DOMpurify settings for SVG content
     *
     * @private
     */
     const purifySvgConfig = {
        USE_PROFILES: {
            svg: true,
            svgFilters: true
        }
    };

    /**
     * URL fragment prefix requiring load confirmation
     *
     * @private
     */
    const loadConfirmPrefix = '#-';

    /**
     * CryptoData class
     *
     * bundles helper functions used in both paste and comment formats
     *
     * @name CryptoData
     * @class
     */
    function CryptoData(data) {
        this.v = 1;
        // store all keys in the default locations for drop-in replacement
        for (let key in data) {
            this[key] = data[key];
        }

        /**
         * gets the cipher data (cipher text + adata)
         *
         * @name CryptoData.getCipherData
         * @function
         * @return {Array}|{string}
         */
        this.getCipherData = function()
        {
            return this.v === 1 ? this.data : [this.ct, this.adata];
        }
    }

    /**
     * Paste class
     *
     * bundles helper functions around the paste formats
     *
     * @name Paste
     * @class
     */
    function Paste(data) {
        // inherit constructor and methods of CryptoData
        CryptoData.call(this, data);

        /**
         * gets the used formatter
         *
         * @name Paste.getFormat
         * @function
         * @return {string}
         */
        this.getFormat = function()
        {
            return this.v === 1 ? this.meta.formatter : this.adata[1];
        }

        /**
         * gets the remaining seconds before the paste expires
         *
         * returns 0 if there is no expiration
         *
         * @name Paste.getTimeToLive
         * @function
         * @return {string}
         */
        this.getTimeToLive = function()
        {
            return (this.v === 1 ? this.meta.remaining_time : this.meta.time_to_live) || 0;
        }

        /**
         * is burn-after-reading enabled
         *
         * @name Paste.isBurnAfterReadingEnabled
         * @function
         * @return {bool}
         */
        this.isBurnAfterReadingEnabled = function()
        {
            return (this.v === 1 ? this.meta.burnafterreading : this.adata[3]);
        }

        /**
         * are discussions enabled
         *
         * @name Paste.isDiscussionEnabled
         * @function
         * @return {bool}
         */
        this.isDiscussionEnabled = function()
        {
            return (this.v === 1 ? this.meta.opendiscussion : this.adata[2]);
        }
    }

    /**
     * Comment class
     *
     * bundles helper functions around the comment formats
     *
     * @name Comment
     * @class
     */
    function Comment(data) {
        // inherit constructor and methods of CryptoData
        CryptoData.call(this, data);

        /**
         * gets the UNIX timestamp of the comment creation
         *
         * @name Comment.getCreated
         * @function
         * @return {int}
         */
        this.getCreated = function()
        {
            return this.meta[this.v === 1 ? 'postdate' : 'created'] || 0;
        }

        /**
         * gets the icon of the comment submitter
         *
         * @name Comment.getIcon
         * @function
         * @return {string}
         */
        this.getIcon = function()
        {
            return this.meta[this.v === 1 ? 'vizhash' : 'icon'] || '';
        }
    }

    /**
     * static Helper methods
     *
     * @name Helper
     * @class
     */
    const Helper = (function () {
        const me = {};

        /**
         * character to HTML entity lookup table
         *
         * @see    {@link https://github.com/janl/mustache.js/blob/master/mustache.js#L60}
         * @name Helper.entityMap
         * @private
         * @enum   {Object}
         * @readonly
         */
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };

        /**
         * number of seconds in a minute
         *
         * @name Helper.minute
         * @private
         * @enum   {number}
         * @readonly
         */
        const minute = 60;

        /**
         * number of seconds in an hour
         *
         * = 60 * 60 seconds
         *
         * @name Helper.minute
         * @private
         * @enum   {number}
         * @readonly
         */
        const hour = 3600;

        /**
         * number of seconds in a day
         *
         * = 60 * 60 * 24 seconds
         *
         * @name Helper.day
         * @private
         * @enum   {number}
         * @readonly
         */
        const day = 86400;

        /**
         * number of seconds in a week
         *
         * = 60 * 60 * 24 * 7 seconds
         *
         * @name Helper.week
         * @private
         * @enum   {number}
         * @readonly
         */
        const week = 604800;

        /**
         * number of seconds in a month (30 days, an approximation)
         *
         * = 60 * 60 * 24 * 30 seconds
         *
         * @name Helper.month
         * @private
         * @enum   {number}
         * @readonly
         */
        const month = 2592000;

        /**
         * number of seconds in a non-leap year
         *
         * = 60 * 60 * 24 * 365 seconds
         *
         * @name Helper.year
         * @private
         * @enum   {number}
         * @readonly
         */
        const year = 31536000;

        /**
         * cache for script location
         *
         * @name Helper.baseUri
         * @private
         * @enum   {string|null}
         */
        let baseUri = null;

        /**
         * converts a duration (in seconds) into human friendly approximation
         *
         * @name Helper.secondsToHuman
         * @function
         * @param  {number} seconds
         * @return {Array}
         */
        me.secondsToHuman = function(seconds)
        {
            let v;
            if (seconds < minute)
            {
                v = Math.floor(seconds);
                return [v, 'second'];
            }
            if (seconds < hour)
            {
                v = Math.floor(seconds / minute);
                return [v, 'minute'];
            }
            if (seconds < day)
            {
                v = Math.floor(seconds / hour);
                return [v, 'hour'];
            }
            // If less than 2 months, display in days:
            if (seconds < (2 * month))
            {
                v = Math.floor(seconds / day);
                return [v, 'day'];
            }
            v = Math.floor(seconds / month);
            return [v, 'month'];
        };

        /**
         * converts a duration string into seconds
         *
         * The string is expected to be optional digits, followed by a time.
         * Supported times are: min, hour, day, month, year, never
         * Examples: 5min, 13hour, never
         *
         * @name Helper.durationToSeconds
         * @function
         * @param  {String} duration
         * @return {number}
         */
        me.durationToSeconds = function(duration)
        {
            let pieces   = duration.split(/(\D+)/),
                factor   = pieces[0] || 0,
                timespan = pieces[1] || pieces[0];
            switch (timespan)
            {
                case 'min':
                    return factor * minute;
                case 'hour':
                    return factor * hour;
                case 'day':
                    return factor * day;
                case 'week':
                    return factor * week;
                case 'month':
                    return factor * month;
                case 'year':
                    return factor * year;
                case 'never':
                    return 0;
                default:
                    return factor;
            }
        };

        /**
         * text range selection
         *
         * @see    {@link https://stackoverflow.com/questions/985272/jquery-selecting-text-in-an-element-akin-to-highlighting-with-your-mouse}
         * @name   Helper.selectText
         * @function
         * @param  {HTMLElement} element
         */
        me.selectText = function(element)
        {
            let range, selection;

            // MS
            if (document.body.createTextRange) {
                range = document.body.createTextRange();
                range.moveToElementText(element);
                range.select();
            } else if (window.getSelection) {
                selection = window.getSelection();
                range = document.createRange();
                range.selectNodeContents(element);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };

        /**
         * convert URLs to clickable links in the provided element.
         *
         * URLs to handle:
         * <pre>
         *     magnet:?xt.1=urn:sha1:YNCKHTQCWBTRNJIV4WNAE52SJUQCZO5C&xt.2=urn:sha1:TXGCZQTH26NL6OUQAJJPFALHG2LTGBC7
         *     https://example.com:8800/zero/?6f09182b8ea51997#WtLEUO5Epj9UHAV9JFs+6pUQZp13TuspAUjnF+iM+dM=
         *     http://user:example.com@localhost:8800/zero/?6f09182b8ea51997#WtLEUO5Epj9UHAV9JFs+6pUQZp13TuspAUjnF+iM+dM=
         * </pre>
         *
         * @name   Helper.urls2links
         * @function
         * @param  {HTMLElement} element
         */
        me.urls2links = function(element)
        {
            // Ensure element is a DOM element
            if (!(element instanceof Element)) {
                console.error('Helper.urls2links expects a DOM element.');
                return;
            }
            element.innerHTML = DOMPurify.sanitize(
                element.innerHTML.replace(
                    /(((https?|ftp):\/\/[\w?!=&.\/-;#@~%+*-]+(?![\w\s?!&.\/;#~%"=-]>))|((magnet):[\w?=&.\/-;#@~%+*-]+))/ig,
                    '<a href="$1" rel="nofollow noopener noreferrer">$1</a>'
                ),
                purifyHtmlConfig
            );
        };

        /**
         * minimal sprintf emulation for %s and %d formats
         *
         * Note that this function needs the parameters in the same order as the
         * format strings appear in the string, contrary to the original.
         *
         * @see    {@link https://stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format#4795914}
         * @name   Helper.sprintf
         * @function
         * @param  {string} format
         * @param  {...*} args - one or multiple parameters injected into format string
         * @return {string}
         */
        me.sprintf = function()
        {
            const args = Array.prototype.slice.call(arguments);
            let format = args[0],
                i = 1;
            return format.replace(/%(s|d)/g, function (m) {
                let val = args[i];
                if (m === '%d') {
                    val = parseFloat(val);
                    if (isNaN(val)) {
                        val = 0;
                    }
                }
                ++i;
                return val;
            });
        };

        /**
         * get value of cookie, if it was set, empty string otherwise
         *
         * @see    {@link http://www.w3schools.com/js/js_cookies.asp}
         * @name   Helper.getCookie
         * @function
         * @param  {string} cname - may not be empty
         * @return {string}
         */
        me.getCookie = function(cname) {
            const name = cname + '=',
                  ca   = document.cookie.split(';');
            for (let i = 0; i < ca.length; ++i) {
                let c = ca[i];
                while (c.charAt(0) === ' ')
                {
                    c = c.substring(1);
                }
                if (c.indexOf(name) === 0)
                {
                    return c.substring(name.length, c.length);
                }
            }
            return '';
        };

        /**
         * get the current location (without search or hash part of the URL),
         * eg. https://example.com/path/?aaaa#bbbb --> https://example.com/path/
         *
         * @name   Helper.baseUri
         * @function
         * @return {string}
         */
        me.baseUri = function()
        {
            // check for cached version
            if (baseUri !== null) {
                return baseUri;
            }

            baseUri = window.location.origin + window.location.pathname;
            return baseUri;
        };

        /**
         * wrap an object into a Paste, used for mocking in the unit tests
         *
         * @name   Helper.PasteFactory
         * @function
         * @param  {object} data
         * @return {Paste}
         */
        me.PasteFactory = function(data)
        {
            return new Paste(data);
        };

        /**
         * wrap an object into a Comment, used for mocking in the unit tests
         *
         * @name   Helper.CommentFactory
         * @function
         * @param  {object} data
         * @return {Comment}
         */
        me.CommentFactory = function(data)
        {
            return new Comment(data);
        };

        /**
         * convert all applicable characters to HTML entities
         *
         * @see    {@link https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html}
         * @name   Helper.htmlEntities
         * @function
         * @param  {string} str
         * @return {string} escaped HTML
         */
        me.htmlEntities = function(str) {
            return String(str).replace(
                /[&<>"'`=\/]/g, function(s) {
                    return entityMap[s];
                }
            );
        }

        /**
         * calculate expiration date given initial date and expiration period
         *
         * @name   Helper.calculateExpirationDate
         * @function
         * @param  {Date} initialDate - may not be empty
         * @param  {string|number} expirationDisplayStringOrSecondsToExpire - may not be empty
         * @return {Date}
         */
        me.calculateExpirationDate = function(initialDate, expirationDisplayStringOrSecondsToExpire) {
            let expirationDate      = new Date(initialDate),
                secondsToExpiration = expirationDisplayStringOrSecondsToExpire;
            if (typeof expirationDisplayStringOrSecondsToExpire === 'string') {
                secondsToExpiration = me.durationToSeconds(expirationDisplayStringOrSecondsToExpire);
            }

            if (typeof secondsToExpiration !== 'number') {
                throw new Error('Cannot calculate expiration date.');
            }
            if (secondsToExpiration === 0) {
                return null;
            }

            expirationDate = expirationDate.setUTCSeconds(expirationDate.getUTCSeconds() + secondsToExpiration);
            return expirationDate;
        };

        /**
         * resets state, used for unit testing
         *
         * @name   Helper.reset
         * @function
         */
        me.reset = function()
        {
            baseUri = null;
        };

        return me;
    })();

    /**
     * internationalization module
     *
     * @name I18n
     * @class
     */
    const I18n = (function () {
        const me = {};

        /**
         * const for string of loaded language
         *
         * @name I18n.languageLoadedEvent
         * @private
         * @prop   {string}
         * @readonly
         */
        const languageLoadedEvent = 'languageLoaded';

        /**
         * supported languages, minus the built in 'en'
         *
         * @name I18n.supportedLanguages
         * @private
         * @prop   {string[]}
         * @readonly
         */
        const supportedLanguages = ['ar', 'bg', 'ca', 'co', 'cs', 'de', 'el', 'es', 'et', 'fi', 'fr', 'he', 'hu', 'id', 'it', 'ja', 'jbo', 'lt', 'no', 'nl', 'pl', 'pt', 'oc', 'ro', 'ru', 'sk', 'sl', 'th', 'tr', 'uk', 'zh'];

        /**
         * built in language
         *
         * @name I18n.language
         * @private
         * @prop   {string|null}
         */
        let language = null;

        /**
         * translation cache
         *
         * @name I18n.translations
         * @private
         * @enum   {Object}
         */
        let translations = {};

        /**
         * translate a string, alias for I18n.translate
         *
         * @name   I18n._
         * @function
         * @param  {jQuery} $element - optional
         * @param  {string} messageId
         * @param  {...*} args - one or multiple parameters injected into placeholders
         * @return {string}
         */
        me._ = function()
        {
            return me.translate.apply(this, arguments);
        };

        /**
         * translate a string
         *
         * Optionally pass a jQuery element as the first parameter, to automatically
         * let the text of this element be replaced. In case the (asynchronously
         * loaded) language is not downloaded yet, this will make sure the string
         * is replaced when it eventually gets loaded. Using this is both simpler
         * and more secure, as it avoids potential XSS when inserting text.
         * The next parameter is the message ID, matching the ones found in
         * the translation files under the i18n directory.
         * Any additional parameters will get inserted into the message ID in
         * place of %s (strings) or %d (digits), applying the appropriate plural
         * in case of digits. See also Helper.sprintf().
         *
         * @name   I18n.translate
         * @function
         * @param  {jQuery} $element - optional
         * @param  {string} messageId
         * @param  {...*} args - one or multiple parameters injected into placeholders
         * @return {string}
         */
        me.translate = function()
        {
            // convert parameters to array
            let args = Array.prototype.slice.call(arguments),
                messageId,
                element = null;

            // parse arguments
            if (args[0] instanceof Element) {
                // optional DOM element as first parameter
                element = args[0];
                args.shift();
            }

            // extract messageId from arguments
            let usesPlurals = Array.isArray(args[0]);
            if (usesPlurals) {
                // use the first plural form as messageId, otherwise the singular
                messageId = args[0].length > 1 ? args[0][1] : args[0][0];
            } else {
                messageId = args[0];
            }

            if (messageId.length === 0) {
                return messageId;
            }

            // if no translation string cannot be found (in translations object)
            if (!translations.hasOwnProperty(messageId) || language === null) {
                // if language is still loading and we have an elemt assigned
                if (language === null && element !== null) {
                    // handle the error by attaching the language loaded event
                    let orgArguments = arguments;
                    document.addEventListener(languageLoadedEvent, function () {
                        // re-execute this function
                        me.translate.apply(this, orgArguments);
                    });

                    // and fall back to English for now until the real language
                    // file is loaded
                }

                // for all other languages than English for which this behaviour
                // is expected as it is built-in, log error
                if (language !== null && language !== 'en') {
                    console.error('Missing translation for: \'' + messageId + '\' in language ' + language);
                    // fallback to English
                }

                // save English translation (should be the same on both sides)
                translations[messageId] = args[0];
            }

            // lookup plural translation
            if (usesPlurals && Array.isArray(translations[messageId])) {
                let n = parseInt(args[1] || 1, 10),
                    key = me.getPluralForm(n),
                    maxKey = translations[messageId].length - 1;
                if (key > maxKey) {
                    key = maxKey;
                }
                args[0] = translations[messageId][key];
                args[1] = n;
            } else {
                // lookup singular translation
                args[0] = translations[messageId];
            }

            // messageID may contain HTML, but should be from a trusted source (code or translation JSON files)
            let containsHtml = isStringContainsHtml(args[0]);

            // prevent double encoding, when we insert into a text node
            if (containsHtml || element === null) {
                for (let i = 0; i < args.length; ++i) {
                    // parameters (i > 0) may never contain HTML as they may come from untrusted parties
                    if ((containsHtml ? i > 1 : i > 0) || !containsHtml) {
                        args[i] = Helper.htmlEntities(args[i]);
                    }
                }
            }
            // format string
            let output = Helper.sprintf.apply(this, args);

            if (containsHtml) {
                // only allow tags/attributes we actually use in translations
                output = DOMPurify.sanitize(
                    output, {
                        ALLOWED_TAGS: ['a', 'i', 'span', 'kbd'],
                        ALLOWED_ATTR: ['href', 'id']
                    }
                );
            }

            // if element is given, insert translation
            if (element !== null) {
                if (containsHtml) {
                    element.innerHTML = output;
                } else {
                    // text node takes care of entity encoding
                    element.textContent = output;
                }
                return '';
            }

            return output;
        };

        /**
         * get currently loaded language
         *
         * @name   I18n.getLanguage
         * @function
         * @return {string}
         */
        me.getLanguage = function()
        {
            return language;
        };

        /**
         * per language functions to use to determine the plural form
         *
         * @see    {@link https://docs.translatehouse.org/projects/localization-guide/en/latest/l10n/pluralforms.html}
         * @name   I18n.getPluralForm
         * @function
         * @param  {int} n
         * @return {int} array key
         */
        me.getPluralForm = function(n) {
            switch (language)
            {
                case 'ar':
                    return n === 0 ? 0 : (n === 1 ? 1 : (n === 2 ? 2 : (n % 100 >= 3 && n % 100 <= 10 ? 3 : (n % 100 >= 11 ? 4 : 5))));
                case 'cs':
                case 'sk':
                    return n === 1 ? 0 : (n >= 2 && n <= 4 ? 1 : 2);
                case 'co':
                case 'fr':
                case 'oc':
                case 'tr':
                case 'zh':
                    return n > 1 ? 1 : 0;
                case 'he':
                    return n === 1 ? 0 : (n === 2 ? 1 : ((n < 0 || n > 10) && (n % 10 === 0) ? 2 : 3));
                case 'id':
                case 'ja':
                case 'jbo':
                case 'th':
                    return 0;
                case 'lt':
                    return n % 10 === 1 && n % 100 !== 11 ? 0 : ((n % 10 >= 2 && n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
                case 'pl':
                    return n === 1 ? 0 : (n % 10 >= 2 && n %10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
                case 'ro':
                    return n === 1 ? 0 : ((n === 0 || (n % 100 > 0 && n % 100 < 20)) ? 1 : 2);
                case 'ru':
                case 'uk':
                    return n % 10 === 1 && n % 100 !== 11 ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2);
                case 'sl':
                    return n % 100 === 1 ? 1 : (n % 100 === 2 ? 2 : (n % 100 === 3 || n % 100 === 4 ? 3 : 0));
                // bg, ca, de, el, en, es, et, fi, hu, it, nl, no, pt
                default:
                    return n !== 1 ? 1 : 0;
            }
        };

        /**
         * load translations into cache
         *
         * @name   I18n.loadTranslations
         * @function
         */
        me.loadTranslations = function()
        {
            let newLanguage = Helper.getCookie('lang');

            // auto-select language based on browser settings
            if (newLanguage.length === 0) {
                newLanguage = (navigator.language || navigator.userLanguage || 'en');
                if (newLanguage.indexOf('-') > 0) {
                    newLanguage = newLanguage.split('-')[0];
                }
            }

            // if language is already used skip update
            if (newLanguage === language) {
                return;
            }

            // if language is built-in (English) skip update
            if (newLanguage === 'en') {
                language = 'en';
                return;
            }

            // if language is not supported, show error
            if (supportedLanguages.indexOf(newLanguage) === -1) {
                console.error('Language \'%s\' is not supported. Translation failed, fallback to English.', newLanguage);
                language = 'en';
                return;
            }

            // load strings from JSON
            fetch('i18n/' + newLanguage + '.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('HTTP error ' + response.status);
                    }
                    return response.json();
                })
                .then(data => {
                    language = newLanguage;
                    translations = data;
                    document.dispatchEvent(new Event(languageLoadedEvent));
                })
                .catch(error => {
                    console.error('Language \'' + newLanguage + '\' could not be loaded (' + error.message + '). Translation failed, fallback to English.');
                    language = 'en';
                    // Potentially dispatch languageLoadedEvent here too if parts of the UI should update even on fallback
                    // For now, keeping it simple and not dispatching on error, to closely match original behavior of only dispatching on success.
                });
        };

        /**
         * resets state, used for unit testing
         *
         * @name   I18n.reset
         * @function
         */
        me.reset = function(mockLanguage, mockTranslations)
        {
            language = mockLanguage || null;
            translations = mockTranslations || {};
        };

        /**
         * Check if string contains valid HTML code
         *
         * @name I18n.isStringContainsHtml
         * @function
         * @private
         * @param {string} messageId
         * @returns {boolean}
         */
        function isStringContainsHtml(messageId) {
            // An integer which specifies the type of the node. An Element node like <p> or <div>.
            const elementNodeType = 1;

            const div = document.createElement('div');
            div.innerHTML = messageId;

            return Array.from(div.childNodes).some(node => node.nodeType === elementNodeType);
        }

        return me;
    })();

    /**
     * handles everything related to en/decryption
     *
     * @name CryptTool
     * @class
     */
    const CryptTool = (function () {
        const me = {};

        /**
         * base58 encoder & decoder
         *
         * @private
         */
        let base58 = new baseX('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');

        /**
         * convert UTF-8 string stored in a DOMString to a standard UTF-16 DOMString
         *
         * Iterates over the bytes of the message, converting them all hexadecimal
         * percent encoded representations, then URI decodes them all
         *
         * @name   CryptTool.utf8To16
         * @function
         * @private
         * @param  {string} message UTF-8 string
         * @return {string} UTF-16 string
         */
        function utf8To16(message)
        {
            return decodeURIComponent(
                message.split('').map(
                    function(character)
                    {
                        return '%' + ('00' + character.charCodeAt(0).toString(16)).slice(-2);
                    }
                ).join('')
            );
        }

        /**
         * convert DOMString (UTF-16) to a UTF-8 string stored in a DOMString
         *
         * URI encodes the message, then finds the percent encoded characters
         * and transforms these hexadecimal representation back into bytes
         *
         * @name   CryptTool.utf16To8
         * @function
         * @private
         * @param  {string} message UTF-16 string
         * @return {string} UTF-8 string
         */
        function utf16To8(message)
        {
            return encodeURIComponent(message).replace(
                /%([0-9A-F]{2})/g,
                function (match, hexCharacter)
                {
                    return String.fromCharCode('0x' + hexCharacter);
                }
            );
        }

        /**
         * convert ArrayBuffer into a UTF-8 string
         *
         * Iterates over the bytes of the array, catenating them into a string
         *
         * @name   CryptTool.arraybufferToString
         * @function
         * @private
         * @param  {ArrayBuffer} messageArray
         * @return {string} message
         */
        function arraybufferToString(messageArray)
        {
            const array = new Uint8Array(messageArray);
            let message = '',
                i       = 0;
            while(i < array.length) {
                message += String.fromCharCode(array[i++]);
            }
            return message;
        }

        /**
         * convert UTF-8 string into a Uint8Array
         *
         * Iterates over the bytes of the message, writing them to the array
         *
         * @name   CryptTool.stringToArraybuffer
         * @function
         * @private
         * @param  {string} message UTF-8 string
         * @return {Uint8Array} array
         */
        function stringToArraybuffer(message)
        {
            const messageArray = new Uint8Array(message.length);
            for (let i = 0; i < message.length; ++i) {
                messageArray[i] = message.charCodeAt(i);
            }
            return messageArray;
        }

        /**
         * compress a string (deflate compression), returns buffer
         *
         * @name   CryptTool.compress
         * @async
         * @function
         * @private
         * @param  {string} message
         * @param  {string} mode
         * @param  {object} zlib
         * @throws {string}
         * @return {ArrayBuffer} data
         */
        async function compress(message, mode, zlib)
        {
            message = stringToArraybuffer(
                utf16To8(message)
            );
            if (mode === 'zlib') {
                if (typeof zlib === 'undefined') {
                    throw 'Error compressing paste, due to missing WebAssembly support.'
                }
                return zlib.deflate(message).buffer;
            }
            return message;
        }

        /**
         * decompress potentially base64 encoded, deflate compressed buffer, returns string
         *
         * @name   CryptTool.decompress
         * @async
         * @function
         * @private
         * @param  {ArrayBuffer} data
         * @param  {string} mode
         * @param  {object} zlib
         * @throws {string}
         * @return {string} message
         */
        async function decompress(data, mode, zlib)
        {
            if (mode === 'zlib' || mode === 'none') {
                if (mode === 'zlib') {
                    if (typeof zlib === 'undefined') {
                        throw 'Error decompressing paste, your browser does not support WebAssembly. Please use another browser to view this paste.'
                    }
                    data = zlib.inflate(
                        new Uint8Array(data)
                    ).buffer;
                }
                return utf8To16(
                    arraybufferToString(data)
                );
            }
            // detect presence of Base64.js, indicating legacy ZeroBin paste
            if (typeof Base64 === 'undefined') {
                return utf8To16(
                    RawDeflate.inflate(
                        utf8To16(
                            atob(
                                arraybufferToString(data)
                            )
                        )
                    )
                );
            } else {
                return Base64.btou(
                    RawDeflate.inflate(
                        Base64.fromBase64(
                            arraybufferToString(data)
                        )
                    )
                );
            }
        }

        /**
         * returns specified number of random bytes
         *
         * @name   CryptTool.getRandomBytes
         * @function
         * @private
         * @param  {int} length number of random bytes to fetch
         * @throws {string}
         * @return {string} random bytes
         */
        function getRandomBytes(length)
        {
            let bytes       = '';
            const byteArray = new Uint8Array(length);
            window.crypto.getRandomValues(byteArray);
            for (let i = 0; i < length; ++i) {
                bytes += String.fromCharCode(byteArray[i]);
            }
            return bytes;
        }

        /**
         * derive cryptographic key from key string and password
         *
         * @name   CryptTool.deriveKey
         * @async
         * @function
         * @private
         * @param  {string} key
         * @param  {string} password
         * @param  {array}  spec cryptographic specification
         * @return {CryptoKey} derived key
         */
        async function deriveKey(key, password, spec)
        {
            let keyArray = stringToArraybuffer(key);
            if (password.length > 0) {
                // version 1 pastes did append the passwords SHA-256 hash in hex
                if (spec[7] === 'rawdeflate') {
                    let passwordBuffer = await window.crypto.subtle.digest(
                        {name: 'SHA-256'},
                        stringToArraybuffer(
                            utf16To8(password)
                        )
                    ).catch(Alert.showError);
                    password = Array.prototype.map.call(
                        new Uint8Array(passwordBuffer),
                        x => ('00' + x.toString(16)).slice(-2)
                    ).join('');
                }
                let passwordArray = stringToArraybuffer(password),
                    newKeyArray = new Uint8Array(keyArray.length + passwordArray.length);
                newKeyArray.set(keyArray, 0);
                newKeyArray.set(passwordArray, keyArray.length);
                keyArray = newKeyArray;
            }

            // import raw key
            const importedKey = await window.crypto.subtle.importKey(
                'raw', // only 'raw' is allowed
                keyArray,
                {name: 'PBKDF2'}, // we use PBKDF2 for key derivation
                false, // the key may not be exported
                ['deriveKey'] // we may only use it for key derivation
            ).catch(Alert.showError);

            // derive a stronger key for use with AES
            return window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2', // we use PBKDF2 for key derivation
                    salt: stringToArraybuffer(spec[1]), // salt used in HMAC
                    iterations: spec[2], // amount of iterations to apply
                    hash: {name: 'SHA-256'} // can be "SHA-1", "SHA-256", "SHA-384" or "SHA-512"
                },
                importedKey,
                {
                    name: 'AES-' + spec[6].toUpperCase(), // can be any supported AES algorithm ("AES-CTR", "AES-CBC", "AES-CMAC", "AES-GCM", "AES-CFB", "AES-KW", "ECDH", "DH" or "HMAC")
                    length: spec[3] // can be 128, 192 or 256
                },
                false, // the key may not be exported
                ['encrypt', 'decrypt'] // we may only use it for en- and decryption
            ).catch(Alert.showError);
        }

        /**
         * gets crypto settings from specification and authenticated data
         *
         * @name   CryptTool.cryptoSettings
         * @function
         * @private
         * @param  {string} adata authenticated data
         * @param  {array}  spec cryptographic specification
         * @return {object} crypto settings
         */
        function cryptoSettings(adata, spec)
        {
            return {
                name: 'AES-' + spec[6].toUpperCase(), // can be any supported AES algorithm ("AES-CTR", "AES-CBC", "AES-CMAC", "AES-GCM", "AES-CFB", "AES-KW", "ECDH", "DH" or "HMAC")
                iv: stringToArraybuffer(spec[0]), // the initialization vector you used to encrypt
                additionalData: stringToArraybuffer(adata), // the addtional data you used during encryption (if any)
                tagLength: spec[4] // the length of the tag you used to encrypt (if any)
            };
        }

        /**
         * compress, then encrypt message with given key and password
         *
         * @name   CryptTool.cipher
         * @async
         * @function
         * @param  {string} key
         * @param  {string} password
         * @param  {string} message
         * @param  {array}  adata
         * @return {array}  encrypted message in base64 encoding & adata containing encryption spec
         */
        me.cipher = async function(key, password, message, adata)
        {
            let zlib = (await z);
            // AES in Galois Counter Mode, keysize 256 bit,
            // authentication tag 128 bit, 10000 iterations in key derivation
            const compression = (
                    typeof zlib === 'undefined' ?
                    'none' : // client lacks support for WASM
                    (document.body.dataset.compression || 'zlib')
                ),
                spec = [
                    getRandomBytes(16), // initialization vector
                    getRandomBytes(8),  // salt
                    100000,             // iterations
                    256,                // key size
                    128,                // tag size
                    'aes',              // algorithm
                    'gcm',              // algorithm mode
                    compression         // compression
                ], encodedSpec = [];
            for (let i = 0; i < spec.length; ++i) {
                encodedSpec[i] = i < 2 ? btoa(spec[i]) : spec[i];
            }
            if (adata.length === 0) {
                // comment
                adata = encodedSpec;
            } else if (adata[0] === null) {
                // paste
                adata[0] = encodedSpec;
            }

            // finally, encrypt message
            return [
                btoa(
                    arraybufferToString(
                        await window.crypto.subtle.encrypt(
                            cryptoSettings(JSON.stringify(adata), spec),
                            await deriveKey(key, password, spec),
                            await compress(message, compression, zlib)
                        ).catch(Alert.showError)
                    )
                ),
                adata
            ];
        };

        /**
         * decrypt message with key, then decompress
         *
         * @name   CryptTool.decipher
         * @async
         * @function
         * @param  {string} key
         * @param  {string} password
         * @param  {string|object} data encrypted message
         * @return {string} decrypted message, empty if decryption failed
         */
        me.decipher = async function(key, password, data)
        {
            let adataString, spec, cipherMessage, plaintext;
            let zlib = (await z);
            if (data instanceof Array) {
                // version 2
                adataString = JSON.stringify(data[1]);
                // clone the array instead of passing the reference
                spec = (data[1][0] instanceof Array ? data[1][0] : data[1]).slice();
                cipherMessage = data[0];
            } else if (typeof data === 'string') {
                // version 1
                let object = JSON.parse(data);
                adataString = atob(object.adata);
                spec = [
                    object.iv,
                    object.salt,
                    object.iter,
                    object.ks,
                    object.ts,
                    object.cipher,
                    object.mode,
                    'rawdeflate'
                ];
                cipherMessage = object.ct;
            } else {
                throw 'unsupported message format';
            }
            spec[0] = atob(spec[0]);
            spec[1] = atob(spec[1]);
            if (spec[7] === 'zlib') {
                if (typeof zlib === 'undefined') {
                    throw 'Error decompressing paste, your browser does not support WebAssembly. Please use another browser to view this paste.'
                }
            }
            try {
                plaintext = await window.crypto.subtle.decrypt(
                    cryptoSettings(adataString, spec),
                    await deriveKey(key, password, spec),
                    stringToArraybuffer(
                        atob(cipherMessage)
                    )
                );
            } catch(err) {
                console.error(err);
                return '';
            }
            try {
                return await decompress(plaintext, spec[7], zlib);
            } catch(err) {
                Alert.showError(err);
                return err;
            }
        };

        /**
         * returns a random symmetric key
         *
         * generates 256 bit long keys (8 Bits * 32) for AES with 256 bit long blocks
         *
         * @name   CryptTool.getSymmetricKey
         * @function
         * @throws {string}
         * @return {string} raw bytes
         */
        me.getSymmetricKey = function()
        {
            return getRandomBytes(32);
        };

        /**
         * base58 encode a DOMString (UTF-16)
         *
         * @name   CryptTool.base58encode
         * @function
         * @param  {string} input
         * @return {string} output
         */
        me.base58encode = function(input)
        {
            return base58.encode(
                stringToArraybuffer(input)
            );
        }

        /**
         * base58 decode a DOMString (UTF-16)
         *
         * @name   CryptTool.base58decode
         * @function
         * @param  {string} input
         * @return {string} output
         */
        me.base58decode = function(input)
        {
            return arraybufferToString(
                base58.decode(input)
            );
        }

        return me;
    })();

    /**
     * (Model) Data source (aka MVC)
     *
     * @name   Model
     * @class
     */
    const Model = (function () {
        const me = {};

        let id = null,
            pasteData = null,
            symmetricKey = null,
            templatesElem; // Renamed from $templates

        /**
         * returns the expiration set in the HTML
         *
         * @name   Model.getExpirationDefault
         * @function
         * @return string
         */
        me.getExpirationDefault = function()
        {
            const select = document.getElementById('pasteExpiration');
            return select ? select.value : undefined;
        };

        /**
         * returns the format set in the HTML
         *
         * @name   Model.getFormatDefault
         * @function
         * @return string
         */
        me.getFormatDefault = function()
        {
            const select = document.getElementById('pasteFormatter');
            return select ? select.value : undefined;
        };

        /**
         * returns the paste data (including the cipher data)
         *
         * @name   Model.getPasteData
         * @function
         * @param {function} callback (optional) Called when data is available
         * @param {function} useCache (optional) Whether to use the cache or
         *                            force a data reload. Default: true
         * @return string
         */
        me.getPasteData = function(callback, useCache)
        {
            // use cache if possible/allowed
            if (useCache !== false && pasteData !== null) {
                //execute callback
                if (typeof callback === 'function') {
                    return callback(pasteData);
                }

                // alternatively just using inline
                return pasteData;
            }

            // reload data
            ServerInteraction.prepare();
            ServerInteraction.setUrl(Helper.baseUri() + '?pasteid=' + me.getPasteId());

            ServerInteraction.setFailure(function (status, data) {
                // revert loading status…
                Alert.hideLoading();
                TopNav.showViewButtons();

                // show error message
                Alert.showError(ServerInteraction.parseUploadError(status, data, 'get paste data'));
            });
            ServerInteraction.setSuccess(function (status, data) {
                pasteData = new Paste(data);

                if (typeof callback === 'function') {
                    return callback(pasteData);
                }
            });
            ServerInteraction.run();
        };

        /**
         * get the pastes unique identifier from the URL,
         * eg. https://example.com/path/?c05354954c49a487#dfdsdgdgdfgdf returns c05354954c49a487
         *
         * @name   Model.getPasteId
         * @function
         * @return {string} unique identifier
         * @throws {string}
         */
        me.getPasteId = function()
        {
            const idRegEx = /^[a-z0-9]{16}$/;

            // return cached value
            if (id !== null) {
                return id;
            }

            // do use URL interface, if possible
            const url = new URL(window.location);

            for (const param of url.searchParams) {
                const key = param[0];
                const value = param[1];

                if (value === '' && idRegEx.test(key)) {
                    // safe, as the whole regex is matched
                    id = key;
                    return key;
                }
            }

            if (id === null) {
                throw 'no paste id given';
            }

            return id;
        }

        /**
         * returns true, when the URL has a delete token and the current call was used for deleting a paste.
         *
         * @name   Model.hasDeleteToken
         * @function
         * @return {bool}
         */
        me.hasDeleteToken = function()
        {
            return window.location.search.indexOf('deletetoken') !== -1;
        }

        /**
         * return the deciphering key stored in anchor part of the URL
         *
         * @name   Model.getPasteKey
         * @function
         * @return {string|null} key
         * @throws {string}
         */
        me.getPasteKey = function()
        {
            if (symmetricKey === null) {
                let startPos = 1;
                if(window.location.hash.startsWith(loadConfirmPrefix)) {
                    startPos = loadConfirmPrefix.length;
                }
                let newKey = window.location.hash.substring(startPos);

                // Some web 2.0 services and redirectors add data AFTER the anchor
                // (such as &utm_source=...). We will strip any additional data.
                let ampersandPos = newKey.indexOf('&');
                if (ampersandPos > -1)
                {
                    newKey = newKey.substring(0, ampersandPos);
                }
                if (newKey === '') {
                    throw 'no encryption key given';
                }

                // version 2 uses base58, version 1 uses base64 without decoding
                try {
                    // base58 encode strips NULL bytes at the beginning of the
                    // string, so we re-add them if necessary
                    symmetricKey = CryptTool.base58decode(newKey).padStart(32, '\u0000');
                } catch(e) {
                    symmetricKey = newKey;
                }
            }

            return symmetricKey;
        };

        /**
         * returns a jQuery copy of the HTML template
         *
         * @name Model.getTemplate
         * @function
         * @param  {string} name - the name of the template
         * @return {Element}
         */
        me.getTemplate = function(name)
        {
            if (!templatesElem) return null;
            // find template
            const template = templatesElem.querySelector('#' + name + 'template');
            if (!template) return null;
            let element = template.cloneNode(true);
            // change ID to avoid collisions (one ID should really be unique)
            element.id = name;
            return element;
        };

        /**
         * resets state, used for unit testing
         *
         * @name   Model.reset
         * @function
         */
        me.reset = function()
        {
            pasteData = templatesElem = id = symmetricKey = null;
        };

        /**
         * init navigation manager
         *
         * preloads jQuery elements
         *
         * @name   Model.init
         * @function
         */
        me.init = function()
        {
            templatesElem = document.getElementById('templates');
        };

        return me;
    })();

    /**
     * Helper functions for user interface
     *
     * everything directly UI-related, which fits nowhere else
     *
     * @name   UiHelper
     * @class
     */
    const UiHelper = (function () {
        const me = {};

        /**
         * handle history (pop) state changes
         *
         * currently this does only handle redirects to the home page.
         *
         * @name   UiHelper.historyChange
         * @private
         * @function
         * @param  {Event} event
         */
        function historyChange(event)
        {
            let currentLocation = Helper.baseUri();
            // For PopStateEvent, the state is directly on the event object.
            // The event.target for window events is the window itself. Use window.location.href.
            if (event.state === null && // no state object passed
                window.location.href === currentLocation && // target location is home page (event.target.location.href might be undefined for PopStateEvent)
                currentLocation !== window.location.href // Check if we are not already on the home page to prevent loop
            ) {
                // redirect to home page
                window.location.href = currentLocation;
            }
        }

        /**
         * reload the page
         *
         * This takes the user to the PrivateBin homepage.
         *
         * @name   UiHelper.reloadHome
         * @function
         */
        me.reloadHome = function()
        {
            window.location.href = Helper.baseUri();
        };

        /**
         * checks whether the element is currently visible in the viewport (so
         * the user can actually see it)
         *
         * @see    {@link https://stackoverflow.com/a/40658647}
         * @name   UiHelper.isVisible
         * @function
         * @param  {Element} element The DOM element.
         */
        me.isVisible = function(element)
        {
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            // Using rect.top directly as it's relative to the viewport already.
            // window.scrollY is not needed if comparing against viewport fixed values (0 and window.innerHeight).
            const elementTopInViewport = rect.top;
            const elementBottomInViewport = rect.bottom;
            // Check if any part of the element is within the viewport height
            return elementTopInViewport < window.innerHeight && elementBottomInViewport >= 0;
        };

        /**
         * scrolls to a specific element
         *
         * @see    {@link https://stackoverflow.com/questions/4198041/jquery-smooth-scroll-to-an-anchor#answer-12714767}
         * @name   UiHelper.scrollTo
         * @function
         * @param  {Element}          element        The DOM element to move to.
         * @param  {(number|string)}  animationDuration if 0, scrolls immediately, otherwise defines approximate duration for smooth scroll.
         * @param  {string}           animationEffect   (ignored, kept for compatibility)
         * @param  {function}         finishedCallback  function to call after scrolling.
         */
        me.scrollTo = function(element, animationDuration, animationEffect, finishedCallback)
        {
            if (!element) return;

            const margin = 50; // Top margin to leave above the element
            const elementRect = element.getBoundingClientRect();
            const elementTopRelativeToDocument = elementRect.top + window.scrollY;

            let dest = elementTopRelativeToDocument - margin;

            // Ensure dest is not less than 0
            dest = Math.max(0, dest);

            // Ensure dest does not scroll past the bottom of the page content
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            dest = Math.min(dest, maxScroll);

            if (animationDuration === 0) {
                window.scrollTo({ top: dest, behavior: 'auto' });
                if (typeof finishedCallback === 'function') {
                    finishedCallback();
                }
            } else {
                window.scrollTo({ top: dest, behavior: 'smooth' });
                const duration = parseInt(animationDuration, 10) || 300; // Default to 300ms if NaN
                if (typeof finishedCallback === 'function') {
                    // Since 'smooth' scroll doesn't have a reliable end event,
                    // and its actual duration can vary by browser,
                    // we use setTimeout as an approximation.
                    // For more precise control, a polyfill or a more complex solution
                    // observing scroll position would be needed.
                    setTimeout(finishedCallback, duration);
                }
            }
        };

        /**
         * trigger a history (pop) state change
         *
         * used to test the UiHelper.historyChange private function
         *
         * @name   UiHelper.mockHistoryChange
         * @function
         * @param  {string} state   (optional) state to mock
         */
        me.mockHistoryChange = function(state)
        {
            if (typeof state === 'undefined') {
                state = null;
            }
            historyChange(new PopStateEvent('popstate', { state: state }));
        };

        /**
         * initialize
         *
         * @name   UiHelper.init
         * @function
         */
        me.init = function()
        {
            // update link to home page
            document.querySelectorAll('.reloadlink').forEach(link => link.href = Helper.baseUri());

            window.addEventListener('popstate', historyChange);
        };

        return me;
    })();

    /**
     * Alert/error manager
     *
     * @name   Alert
     * @class
     */
    const Alert = (function () {
        const me = {};

        let errorMessageElem,
            loadingIndicatorElem,
            statusMessageElem,
            remainingTimeElem,
            currentIcon,
            customHandler;

        const alertType = [
            'loading',
            'info',    // status icon
            'warning', // warning icon
            'danger'   // error icon
        ];

        /**
         * forwards a request to the i18n module and shows the element
         *
         * @name   Alert.handleNotification
         * @private
         * @function
         * @param  {int} id - id of notification
         * @param  {Element} element    - DOM element
         * @param  {string|array} args
         * @param  {string|null} icon - optional, icon
         */
        function handleNotification(id, element, args, icon)
        {
            // basic parsing/conversion of parameters
            if (typeof icon === 'undefined') {
                icon = null;
            }
            if (typeof args === 'undefined') {
                args = null;
            } else if (typeof args === 'string') {
                // convert string to array if needed
                args = [args];
            } else if (args  instanceof Error) {
                // extract message into array if needed
                args = [args.message];
            }

            // pass to custom handler if defined
            if (typeof customHandler === 'function') {
                // Pass the DOM element, not jQuery wrapped
                let handlerResult = customHandler(alertType[id], element, args, icon);
                if (handlerResult === true) {
                    // if it returns true, skip own handler
                    return;
                }
                if (handlerResult instanceof Element) {
                    // continue processing with new element
                    element = handlerResult;
                    icon = null; // icons not supported in this case
                }
            }
            let translationTarget = element;

            // handle icon, if template uses one
            const glyphIconElem = element.querySelector(':first-child.glyphicon'); // Added .glyphicon for specificity
            if (glyphIconElem) {
                // if there is an icon, we need to provide an inner element
                // to translate the message into, instead of the parent
                translationTarget = document.createElement('span');
                // element.innerHTML = ' '; // Clear existing content - this removes the icon too.
                // Instead, remove all children except the icon.
                while (element.lastChild && element.lastChild !== glyphIconElem) {
                    element.removeChild(element.lastChild);
                }
                if (element.textContent.trim() !== '') element.appendChild(document.createTextNode(' ')); // Add space if needed
                element.appendChild(translationTarget); // Append span for text

                if (icon !== null && // icon was passed
                    icon !== currentIcon[id] // and it differs from current icon
                ) {
                    // remove (previous) icon
                    if (currentIcon[id]) glyphIconElem.classList.remove(currentIcon[id]);

                    // any other thing as a string (e.g. 'null') (only) removes the icon
                    if (typeof icon === 'string' && icon !== 'null') { // check for 'null' string explicitly
                        // set new icon
                        currentIcon[id] = 'glyphicon-' + icon;
                        glyphIconElem.classList.add(currentIcon[id]);
                    } else {
                         currentIcon[id] = null; // Explicitly nullify if icon is not a string or 'null'
                    }
                } else if (icon === null && currentIcon[id] && glyphIconElem.classList.contains(currentIcon[id])) {
                    // If no icon is passed, but there was one, ensure it's still there or re-add default if needed
                    // This case might need more specific logic if default icons are desired when `icon` is null.
                    // For now, if currentIcon[id] exists, it means it was set before.
                }
            }

            // show text
            if (args !== null) {
                // add DOM element to it as first parameter
                args.unshift(translationTarget);
                // pass it to I18n
                I18n._.apply(this, args);
            }

            // show notification
            element.classList.remove('hidden');
        }

        /**
         * display a status message
         *
         * This automatically passes the text to I18n for translation.
         *
         * @name   Alert.showStatus
         * @function
         * @param  {string|array} message     string, use an array for %s/%d options
         * @param  {string|null}  icon        optional, the icon to show,
         *                                    default: leave previous icon
         */
        me.showStatus = function(message, icon)
        {
            if (statusMessageElem) handleNotification(1, statusMessageElem, message, icon);
        };

        /**
         * display a warning message
         *
         * This automatically passes the text to I18n for translation.
         *
         * @name   Alert.showWarning
         * @function
         * @param  {string|array} message     string, use an array for %s/%d options
         * @param  {string|null}  icon        optional, the icon to show, default:
         *                                    leave previous icon
         */
        me.showWarning = function(message, icon)
        {
            if (errorMessageElem) {
                const glyphIconElem = errorMessageElem.querySelector(':first-child.glyphicon');
                if (glyphIconElem) {
                    if (currentIcon[3] && currentIcon[3] !== ('glyphicon-' + icon)) glyphIconElem.classList.remove(currentIcon[3]); // remove previous error icon if different
                    // Ensure currentIcon[2] (warning icon) is applied
                    const targetWarningIcon = 'glyphicon-' + (icon || 'warning-sign'); // Default to warning-sign if icon is null/empty
                    if (currentIcon[2] && currentIcon[2] !== targetWarningIcon) glyphIconElem.classList.remove(currentIcon[2]);
                    currentIcon[2] = targetWarningIcon;
                    glyphIconElem.classList.add(currentIcon[2]);
                    // Remove other potential alert icons to be safe
                    if (currentIcon[3] && currentIcon[3] !== currentIcon[2]) glyphIconElem.classList.remove(currentIcon[3]);
                    if (currentIcon[1] && currentIcon[1] !== currentIcon[2]) glyphIconElem.classList.remove(currentIcon[1]);
                }
                handleNotification(2, errorMessageElem, message, icon);
            }
        };

        /**
         * display an error message
         *
         * This automatically passes the text to I18n for translation.
         *
         * @name   Alert.showError
         * @function
         * @param  {string|array} message     string, use an array for %s/%d options
         * @param  {string|null}  icon        optional, the icon to show, default:
         *                                    leave previous icon
         */
        me.showError = function(message, icon)
        {
            if (errorMessageElem) {
                 const glyphIconElem = errorMessageElem.querySelector(':first-child.glyphicon');
                 if (glyphIconElem) {
                    const targetErrorIcon = 'glyphicon-' + (icon || 'alert'); // Default to alert if icon is null/empty
                    // Remove other alert icons
                    if (currentIcon[1] && currentIcon[1] !== targetErrorIcon) glyphIconElem.classList.remove(currentIcon[1]);
                    if (currentIcon[2] && currentIcon[2] !== targetErrorIcon) glyphIconElem.classList.remove(currentIcon[2]);
                    if (currentIcon[3] && currentIcon[3] !== targetErrorIcon) glyphIconElem.classList.remove(currentIcon[3]);

                    currentIcon[3] = targetErrorIcon;
                    glyphIconElem.classList.add(currentIcon[3]);
                    }
                }
                handleNotification(2, errorMessageElem, message, icon);
            }
        };

        /**
         * display an error message
         *
         * This automatically passes the text to I18n for translation.
         *
         * @name   Alert.showError
         * @function
         * @param  {string|array} message     string, use an array for %s/%d options
         * @param  {string|null}  icon        optional, the icon to show, default:
         *                                    leave previous icon
         */
        me.showError = function(message, icon)
        {
            if (errorMessageElem) {
                 const glyphIconElem = errorMessageElem.querySelector(':first-child.glyphicon');
                 if (glyphIconElem) {
                    // Ensure currentIcon[3] (default error icon) is applied if no specific icon or different icon is requested
                    if (icon && typeof icon === 'string' && ('glyphicon-' + icon) !== currentIcon[3]) {
                        if(currentIcon[3]) glyphIconElem.classList.remove(currentIcon[3]);
                        currentIcon[3] = 'glyphicon-' + icon; // Update current icon for error
                        glyphIconElem.classList.add(currentIcon[3]);
                    } else if (!icon && currentIcon[3]) {
                         glyphIconElem.classList.add(currentIcon[3]);
                    }
                 }
                handleNotification(3, errorMessageElem, message, icon);
            }
        };

        /**
         * display remaining message
         *
         * This automatically passes the text to I18n for translation.
         *
         * @name   Alert.showRemaining
         * @function
         * @param  {string|array} message     string, use an array for %s/%d options
         */
        me.showRemaining = function(message)
        {
            if (remainingTimeElem) handleNotification(1, remainingTimeElem, message);
        };

        /**
         * shows a loading message, optionally with a percentage
         *
         * This automatically passes all texts to the i10s module.
         *
         * @name   Alert.showLoading
         * @function
         * @param  {string|array|null} message      optional, use an array for %s/%d options, default: 'Loading…'
         * @param  {string|null}       icon         optional, the icon to show, default: leave previous icon
         */
        me.showLoading = function(message, icon)
        {
            // default message text
            if (typeof message === 'undefined') {
                message = 'Loading…';
            }

            if (loadingIndicatorElem) handleNotification(0, loadingIndicatorElem, message, icon);

            // show loading status (cursor)
            document.body.classList.add('loading');
        };

        /**
         * hides the loading message
         *
         * @name   Alert.hideLoading
         * @function
         */
        me.hideLoading = function()
        {
            if (loadingIndicatorElem) loadingIndicatorElem.classList.add('hidden');

            // hide loading cursor
            document.body.classList.remove('loading');
        };

        /**
         * hides any status/error messages
         *
         * This does not include the loading message.
         *
         * @name   Alert.hideMessages
         * @function
         */
        me.hideMessages = function()
        {
            if (statusMessageElem) statusMessageElem.classList.add('hidden');
            if (errorMessageElem) errorMessageElem.classList.add('hidden');
        };

        /**
         * set a custom handler, which gets all notifications.
         *
         * This handler gets the following arguments:
         * alertType (see array), $element, args, icon
         * If it returns true, the own processing will be stopped so the message
         * will not be displayed. Otherwise it will continue.
         * As an aditional feature it can return q jQuery element, which will
         * then be used to add the message there. Icons are not supported in
         * that case and will be ignored.
         * Pass 'null' to reset/delete the custom handler.
         * Note that there is no notification when a message is supposed to get
         * hidden.
         *
         * @name   Alert.setCustomHandler
         * @function
         * @param {function|null} newHandler
         */
        me.setCustomHandler = function(newHandler)
        {
            customHandler = newHandler;
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Alert.init
         * @function
         */
        me.init = function()
        {
            // hide "no javascript" error message
            const noscriptElem = document.getElementById('noscript');
            if (noscriptElem) noscriptElem.style.display = 'none';

            errorMessageElem = document.getElementById('errormessage');
            loadingIndicatorElem = document.getElementById('loadingindicator');
            statusMessageElem = document.getElementById('status');
            remainingTimeElem = document.getElementById('remainingtime');

            currentIcon = [
                'glyphicon-time',
                'glyphicon-info-sign', // status icon
                'glyphicon-warning-sign', // warning icon
                'glyphicon-alert' // error icon
            ];
        };

        return me;
    })();

    /**
     * handles paste status/result
     *
     * @name   PasteStatus
     * @class
     */
    const PasteStatus = (function () {
        const me = {};

        let pasteSuccessElem,
            pasteUrlElem, // Is assigned after dynamic creation
            remainingTimeElem,
            shortenButtonElem;

        /**
         * forward to URL shortener
         *
         * @name   PasteStatus.sendToShortener
         * @private
         * @function
         */
        function sendToShortener()
        {
            if (!shortenButtonElem || shortenButtonElem.classList.contains('buttondisabled') || !pasteUrlElem) {
                return;
            }
            const shortener = shortenButtonElem.dataset.shortener;
            const pasteLink = pasteUrlElem.href;

            if (!shortener || !pasteLink) {
                console.error('Shortener URL or paste URL is missing for PasteStatus.sendToShortener.');
                return;
            }

            fetch(shortener + encodeURIComponent(pasteLink), {
                method: 'GET', // Explicitly GET, though default
                headers: {
                    'Accept': 'text/html, application/xhtml+xml, application/xml, application/json'
                }
                // credentials: 'omit' is default for cross-origin if not specified otherwise
                // timeout is not directly supported by fetch, would need AbortController
            })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => { // Get text for error details
                        throw new Error(`HTTP error ${response.status}${text ? ': ' + text : ''}`);
                    });
                }
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    return response.json();
                }
                return response.text();
            })
            .then(data => me.extractUrl(data)) // Use me.extractUrl as PasteStatus might not be fully initialized
            .catch(error => {
                console.error('Shortener fetch error:', error.message);
                // Fallback to opening in new tab
                window.open(shortener + encodeURIComponent(pasteLink), '_blank', 'noopener, noreferrer');
            });
        }

        /**
         * Forces opening the paste if the link does not do this automatically.
         *
         * This is necessary as browsers will not reload the page when it is
         * already loaded (which is fake as it is set via history.pushState()).
         *
         * @name   PasteStatus.pasteLinkClick
         * @function
         */
        function pasteLinkClick()
        {
            // check if location is (already) shown in URL bar
            if (pasteUrlElem && window.location.href === pasteUrlElem.href) {
                // if so we need to load link by reloading the current site
                window.location.reload(); // Passing true for forceGet is deprecated/not standard
            }
        }

        /**
         * creates a notification after a successfull paste upload
         *
         * @name   PasteStatus.createPasteNotification
         * @function
         * @param  {string} url
         * @param  {string} deleteUrl
         */
        me.createPasteNotification = function(url, deleteUrl)
        {
            const pastelinkContainer = document.getElementById('pastelink');
            if (pastelinkContainer) {
                // I18n._ will handle setting innerHTML or textContent
                I18n._(
                    pastelinkContainer,
                    'Your paste is <a id="pasteurl" href="%s">%s</a> <span id="copyhint">(Hit <kbd>Ctrl</kbd>+<kbd>c</kbd> to copy)</span>',
                    url, url
                );
                // After I18n._ populates pastelinkContainer, #pasteurl will exist.
                pasteUrlElem = document.getElementById('pasteurl');
                if (pasteUrlElem) {
                    pasteUrlElem.addEventListener('click', pasteLinkClick);
                }
            }

            const deleteLinkElem = document.getElementById('deletelink');
            if (deleteLinkElem) {
                deleteLinkElem.href = deleteUrl; // Setting href directly is fine
                const deleteLinkSpan = deleteLinkElem.querySelector('span:not(.glyphicon)');
                if (deleteLinkSpan) {
                    I18n._(deleteLinkSpan, 'Delete data');
                }
            }

            if (shortenButtonElem) {
                shortenButtonElem.classList.remove('buttondisabled');
            }

            if (pasteSuccessElem) {
                pasteSuccessElem.classList.remove('hidden');
            }
            if (pasteUrlElem) {
                Helper.selectText(pasteUrlElem);
            }
        };

        /**
         * extracts URLs from given string
         *
         * if at least one is found, it disables the shortener button and
         * replaces the paste URL
         *
         * @name   PasteStatus.extractUrl
         * @function
         * @param  {string} response
         */
        me.extractUrl = function(response)
        {
            if (typeof response === 'object') {
                response = JSON.stringify(response);
            }
            if (typeof response === 'string' && response.length > 0) {
                const shortUrlMatcher = /https?:\/\/[^\s"<]+/g; // JSON API will have URL in quotes, XML in tags
                const shortUrl = (response.match(shortUrlMatcher) || []).filter(function(urlRegExMatch) {
                    if (typeof URL.canParse === 'function') {
                        return URL.canParse(urlRegExMatch);
                    }
                    // polyfill for older browsers (< 120) & node (< 19.9 & < 18.17)
                    try {
                        return !!new URL(urlRegExMatch);
                    } catch (error) {
                        return false;
                    }
                }).sort(function(a, b) {
                    return a.length - b.length; // shortest first
                })[0];
                if (typeof shortUrl === 'string' && shortUrl.length > 0) {
                    // we disable the button to avoid calling shortener again
                    if (shortenButtonElem) shortenButtonElem.classList.add('buttondisabled');
                    // update link
                    if (pasteUrlElem) {
                        pasteUrlElem.textContent = shortUrl;
                        pasteUrlElem.href = shortUrl;
                        // we pre-select the link so that the user only has to [Ctrl]+[c] the link
                        Helper.selectText(pasteUrlElem);
                    }
                    return;
                }
            }
            Alert.showError('Cannot parse response from URL shortener.');
        };

        /**
         * shows the remaining time
         *
         * @name PasteStatus.showRemainingTime
         * @function
         * @param {Paste} paste
         */
        me.showRemainingTime = function(paste)
        {
            if (paste.isBurnAfterReadingEnabled()) {
                // display paste "for your eyes only" if it is deleted

                // the paste has been deleted when the JSON with the ciphertext
                // has been downloaded

                Alert.showRemaining('FOR YOUR EYES ONLY. Don\'t close this window, this message can\'t be displayed again.');
                if (remainingTimeElem) remainingTimeElem.classList.add('foryoureyesonly');
            } else if (paste.getTimeToLive() > 0) {
                // display paste expiration
                let expiration = Helper.secondsToHuman(paste.getTimeToLive()),
                    expirationLabel = [
                        'This document will expire in %d ' + expiration[1] + '.',
                        'This document will expire in %d ' + expiration[1] + 's.'
                    ];

                Alert.showRemaining([expirationLabel, expiration[0]]);
                if (remainingTimeElem) remainingTimeElem.classList.remove('foryoureyesonly');
            } else {
                // never expires
                return;
            }

            // in the end, display notification
            if (remainingTimeElem) remainingTimeElem.classList.remove('hidden');
        };

        /**
         * hides the remaining time and successful upload notification
         *
         * @name PasteStatus.hideMessages
         * @function
         */
        me.hideMessages = function()
        {
            if (remainingTimeElem) remainingTimeElem.classList.add('hidden');
            if (pasteSuccessElem) pasteSuccessElem.classList.add('hidden');
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   PasteStatus.init
         * @function
         */
        me.init = function()
        {
            pasteSuccessElem = document.getElementById('pastesuccess');
            remainingTimeElem = document.getElementById('remainingtime');
            shortenButtonElem = document.getElementById('shortenbutton');
            // pasteUrlElem is assigned dynamically in createPasteNotification

            if (shortenButtonElem) {
                shortenButtonElem.addEventListener('click', sendToShortener);
            }
        };

        return me;
    })();

    /**
     * password prompt
     *
     * @name Prompt
     * @class
     */
    const Prompt = (function () {
        const me = {};

        let passwordDecryptElem,
            passwordModalElem,
            loadConfirmModalElem,
            loadConfirmOpenNowButton,
            loadConfirmCloseButton,
            passwordFormElem,
            bootstrap5PasswordModal = null, // Retains Bootstrap 5 Modal instance
            bootstrap5LoadConfirmModal = null, // Retains Bootstrap 5 Modal instance
            password = '';

        /**
         * submit a password in the modal dialog
         *
         * @name Prompt.submitPasswordModal
         * @private
         * @function
         * @param  {Event} event
         */
        function submitPasswordModal(event)
        {
            event.preventDefault();

            // get input
            if (passwordDecryptElem) password = passwordDecryptElem.value;

            // hide modal
            if (bootstrap5PasswordModal) {
                bootstrap5PasswordModal.hide();
            }
            // Removed jQuery else branch: $passwordModal.modal('hide');

            PasteDecrypter.run();
        }

        /**
         * Request users confirmation to load possibly burn after reading paste
         *
         * @name   Prompt.requestLoadConfirmation
         * @function
         */
        me.requestLoadConfirmation = function()
        {
            if (loadConfirmModalElem) {
                if (loadConfirmOpenNowButton) {
                    // Ensure listeners are not duplicated if called multiple times
                    loadConfirmOpenNowButton.removeEventListener('click', PasteDecrypter.run);
                    loadConfirmOpenNowButton.addEventListener('click', PasteDecrypter.run);
                }
                if (loadConfirmCloseButton) {
                    loadConfirmCloseButton.removeEventListener('click', Controller.newPaste);
                    loadConfirmCloseButton.addEventListener('click', Controller.newPaste);
                }

                if (bootstrap5LoadConfirmModal) {
                    bootstrap5LoadConfirmModal.show();
                } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal && loadConfirmModalElem instanceof Element) {
                    bootstrap5LoadConfirmModal = new bootstrap.Modal(loadConfirmModalElem);
                    bootstrap5LoadConfirmModal.show();
                } else {
                    console.error("Bootstrap modal not available for load confirmation or loadConfirmModalElem is not a DOM element.");
                }
            } else {
                // Fallback for templates without a load confirmation modal
                if (window.confirm(
                    I18n._('This secret message can only be displayed once. Would you like to see it now?')
                )) {
                    PasteDecrypter.run();
                } else {
                    Controller.newPaste();
                }
            }
        }

        /**
         * ask the user for the password and set it
         *
         * @name Prompt.requestPassword
         * @function
         */
        me.requestPassword = function()
        {
            // show new bootstrap method (if available)
            if (passwordModalElem instanceof Element) { // Check if it's a DOM element
                if (bootstrap5PasswordModal) {
                    bootstrap5PasswordModal.show();
                } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    // Initialize if not already, or get existing instance
                    bootstrap5PasswordModal = bootstrap.Modal.getOrCreateInstance(passwordModalElem);
                    bootstrap5PasswordModal.show();
                } else {
                    console.error("Bootstrap modal not available for password prompt.");
                }
                return;
            }

            // fallback to old method (e.g., for page template without bootstrap modal)
            password = prompt(I18n._('Please enter the password for this paste:'), '');
            if (password === null) {
                throw 'password prompt canceled';
            }
            if (password.length === 0) {
                // recurse…
                return me.requestPassword();
            }
            PasteDecrypter.run();
        };

        /**
         * get the cached password
         *
         * If you do not get a password with this function
         * (returns an empty string), use requestPassword.
         *
         * @name   Prompt.getPassword
         * @function
         * @return {string}
         */
        me.getPassword = function()
        {
            return password;
        };

        /**
         * resets the password to an empty string
         *
         * @name   Prompt.reset
         * @function
         */
        me.reset = function()
        {
            // reset internal
            password = '';

            // and also reset UI
            if (passwordDecryptElem) passwordDecryptElem.value = '';
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   Prompt.init
         * @function
         */
        me.init = function()
        {
            passwordDecryptElem = document.getElementById('passworddecrypt');
            passwordModalElem = document.getElementById('passwordmodal'); // Assuming this is the modal root
            passwordFormElem = document.getElementById('passwordform');
            loadConfirmModalElem = document.getElementById('loadconfirmmodal'); // Assuming this is the modal root

            if (loadConfirmModalElem instanceof Element) { // Check if it's a DOM element
                loadConfirmOpenNowButton = loadConfirmModalElem.querySelector('#loadconfirm-open-now');
                loadConfirmCloseButton = loadConfirmModalElem.querySelector('.close'); // Standard bootstrap class
            }

            if (passwordModalElem instanceof Element && passwordFormElem instanceof Element) {
                passwordFormElem.addEventListener('submit', submitPasswordModal);

                const disableClosingConfig = {
                    backdrop: 'static', // Prevent closing on backdrop click
                    keyboard: false    // Prevent closing with Esc key
                    // 'show: false' is default, modal is shown programmatically
                };

                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    // Get existing instance or create a new one
                    bootstrap5PasswordModal = bootstrap.Modal.getOrCreateInstance(passwordModalElem, disableClosingConfig);
                }

                // Focus input when modal is shown (using Bootstrap event)
                passwordModalElem.addEventListener('shown.bs.modal', () => {
                    if (passwordDecryptElem) {
                        passwordDecryptElem.focus();
                    }
                });
            }
        };

        return me;
    })();

    /**
     * Manage paste/message input, and preview tab
     *
     * Note that the actual preview is handled by PasteViewer.
     *
     * @name   Editor
     * @class
     */
    const Editor = (function () {
        const me = {};

        let editorTabsElem,
            messageEditElem,
            messageEditParentElem,
            messagePreviewElem,
            messagePreviewParentElem,
            messageTabElem,
            messageTabParentElem,
            messageElem,
            isPreview = false,
            isTabSupported = true;

        /**
         * support input of tab character
         *
         * @name   Editor.supportTabs
         * @function
         * @param  {Event} event
         * @this $message (but not used, so it is jQuery-free, possibly faster)
         */
        function supportTabs(event)
        {
            // support disabling tab support using [Esc] and [Ctrl]+[m]
            if (event.key === 'Escape' || (event.ctrlKey && event.key === 'm')) {
                toggleTabSupport();
                if (messageTabElem) messageTabElem.checked = isTabSupported;
                event.preventDefault();
            }
            else if (isTabSupported && event.key === 'Tab') {
                // get caret position & selection
                const val   = this.value,
                      start = this.selectionStart,
                      end   = this.selectionEnd;
                // set textarea value to: text before caret + tab + text after caret
                this.value = val.substring(0, start) + '\t' + val.substring(end);
                // put caret at right position again
                this.selectionStart = this.selectionEnd = start + 1;
                // prevent the textarea to lose focus
                event.preventDefault();
            }
        }

        /**
         * toggle tab support in message textarea
         *
         * @name   Editor.toggleTabSupport
         * @private
         * @function
         */
        function toggleTabSupport()
        {
            isTabSupported = !isTabSupported;
        }

        /**
         * view the Editor tab
         *
         * @name   Editor.viewEditor
         * @function
         * @param  {Event} event - optional
         */
        function viewEditor(event)
        {
            // toggle buttons
            if (messageEditElem) messageEditElem.classList.add('active');
            if (messageEditParentElem) messageEditParentElem.classList.add('active');
            if (messagePreviewElem) messagePreviewElem.classList.remove('active');
            if (messagePreviewParentElem) messagePreviewParentElem.classList.remove('active');

            if (messageEditElem) messageEditElem.setAttribute('aria-selected','true');
            if (messagePreviewElem) messagePreviewElem.setAttribute('aria-selected','false');

            PasteViewer.hide();

            // reshow input
            if (messageElem) messageElem.classList.remove('hidden');
            if (messageTabParentElem) messageTabParentElem.classList.remove('hidden');

            me.focusInput();

            // finish
            isPreview = false;

            // prevent jumping of page to top
            if (typeof event !== 'undefined') {
                event.preventDefault();
            }
        }

        /**
         * view the preview tab
         *
         * @name   Editor.viewPreview
         * @function
         * @param  {Event} event
         */
        function viewPreview(event)
        {
            // toggle buttons
            if (messageEditElem) messageEditElem.classList.remove('active');
            if (messageEditParentElem) messageEditParentElem.classList.remove('active');
            if (messagePreviewElem) messagePreviewElem.classList.add('active');
            if (messagePreviewParentElem) messagePreviewParentElem.classList.add('active');

            if (messageEditElem) messageEditElem.setAttribute('aria-selected','false');
            if (messagePreviewElem) messagePreviewElem.setAttribute('aria-selected','true');

            // hide input as now preview is shown
            if (messageElem) messageElem.classList.add('hidden');
            if (messageTabParentElem) messageTabParentElem.classList.add('hidden');

            // show preview
            if (messageElem) PasteViewer.setText(messageElem.value);
            if (AttachmentViewer.hasAttachmentData()) {
                const attachmentsData = AttachmentViewer.getAttachmentsData();

                attachmentsData.forEach(attachmentData => {
                    const mimeType = AttachmentViewer.getAttachmentMimeType(attachmentData);

                    AttachmentViewer.handleBlobAttachmentPreview(
                        AttachmentViewer.getAttachmentPreview(),
                        attachmentData, mimeType
                    );
                });

                AttachmentViewer.showAttachment();
            }
            PasteViewer.run();

            // finish
            isPreview = true;

            // prevent jumping of page to top
            if (typeof event !== 'undefined') {
                event.preventDefault();
            }
        }

        /**
         * get the state of the preview
         *
         * @name   Editor.isPreview
         * @function
         */
        me.isPreview = function()
        {
            return isPreview;
        };

        /**
         * reset the Editor view
         *
         * @name   Editor.resetInput
         * @function
         */
        me.resetInput = function()
        {
            // go back to input
            if (isPreview) {
                viewEditor();
            }

            // clear content
            if (messageElem) messageElem.value = '';
        };

        /**
         * shows the Editor
         *
         * @name   Editor.show
         * @function
         */
        me.show = function()
        {
            if (messageElem) messageElem.classList.remove('hidden');
            if (messageTabParentElem) messageTabParentElem.classList.remove('hidden');
            if (editorTabsElem) editorTabsElem.classList.remove('hidden');
        };

        /**
         * hides the Editor
         *
         * @name   Editor.hide
         * @function
         */
        me.hide = function()
        {
            if (messageElem) messageElem.classList.add('hidden');
            if (messageTabParentElem) messageTabParentElem.classList.add('hidden');
            if (editorTabsElem) editorTabsElem.classList.add('hidden');
        };

        /**
         * focuses the message input
         *
         * @name   Editor.focusInput
         * @function
         */
        me.focusInput = function()
        {
            if (messageElem) messageElem.focus();
        };

        /**
         * sets a new text
         *
         * @name   Editor.setText
         * @function
         * @param {string} newText
         */
        me.setText = function(newText)
        {
            if (messageElem) messageElem.value = newText;
        };

        /**
         * returns the current text
         *
         * @name   Editor.getText
         * @function
         * @return {string}
         */
        me.getText = function()
        {
            return messageElem ? messageElem.value : '';
        };

        /**
         * init editor
         *
         * preloads jQuery elements
         *
         * @name   Editor.init
         * @function
         */
        me.init = function()
        {
            editorTabsElem = document.getElementById('editorTabs');
            messageElem = document.getElementById('message');
            messageTabElem = document.getElementById('messagetab');
            if (messageTabElem) messageTabParentElem = messageTabElem.parentElement;

            if (messageElem) messageElem.addEventListener('keydown', supportTabs);
            if (messageTabElem) messageTabElem.addEventListener('change', toggleTabSupport);

            messageEditElem = document.getElementById('messageedit');
            if (messageEditElem) {
                messageEditElem.addEventListener('click', viewEditor);
                messageEditParentElem = messageEditElem.parentElement;
            }
            messagePreviewElem = document.getElementById('messagepreview');
            if (messagePreviewElem) {
                messagePreviewElem.addEventListener('click', viewPreview);
                messagePreviewParentElem = messagePreviewElem.parentElement;
            }
        };

        return me;
    })();

    /**
     * (view) Parse and show paste.
     *
     * @name   PasteViewer
     * @class
     */
    const PasteViewer = (function () {
        const me = {};

        let messageTabParentElem,
            placeholderElem,
            prettyMessageElem,
            prettyPrintElem,
            plainTextElem,
            text,
            format = 'plaintext',
            isDisplayed = false,
            isChanged = true; // by default true as nothing was parsed yet

        /**
         * apply the set format on paste and displays it
         *
         * @name   PasteViewer.parsePaste
         * @private
         * @function
         */
        function parsePaste()
        {
            // skip parsing if no text is given
            if (text === '') {
                return;
            }

            if (format === 'markdown') {
                const converter = new showdown.Converter({
                    strikethrough: true,
                    tables: true,
                    tablesHeaderId: true,
                    simplifiedAutoLink: true,
                    excludeTrailingPunctuationFromURLs: true
                });
                // let showdown convert the HTML and sanitize HTML *afterwards*!
                if (plainTextElem) {
                    plainTextElem.innerHTML = DOMPurify.sanitize(
                        converter.makeHtml(text),
                        purifyHtmlConfig
                    );
                    // add table classes from bootstrap css
                    plainTextElem.querySelectorAll('table').forEach(table => {
                        table.classList.add('table-condensed');
                        table.classList.add('table-bordered');
                    });
                }
            } else {
                if (prettyPrintElem) {
                    if (format === 'syntaxhighlighting') {
                        // yes, this is really needed to initialize the environment
                        if (typeof prettyPrint === 'function')
                        {
                            prettyPrint();
                        }
                        prettyPrintElem.innerHTML = prettyPrintOne(
                                Helper.htmlEntities(text), null, true
                            );
                    } else {
                        // = 'plaintext'
                        prettyPrintElem.textContent = text;
                    }
                    Helper.urls2links(prettyPrintElem);
                    prettyPrintElem.style.whiteSpace = 'pre-wrap';
                    prettyPrintElem.style.wordBreak = 'normal';
                    prettyPrintElem.classList.remove('prettyprint');
                }
            }
        }

        /**
         * displays the paste
         *
         * @name   PasteViewer.showPaste
         * @private
         * @function
         */
        function showPaste()
        {
            // instead of "nothing" better display a placeholder
            if (text === '') {
                if (placeholderElem) placeholderElem.classList.remove('hidden');
                return;
            }
            // otherwise hide the placeholder
            if (placeholderElem) placeholderElem.classList.add('hidden');
            if (messageTabParentElem) messageTabParentElem.classList.add('hidden');

            if (format === 'markdown') {
                if (plainTextElem) plainTextElem.classList.remove('hidden');
                if (prettyMessageElem) prettyMessageElem.classList.add('hidden');
            } else {
                if (plainTextElem) plainTextElem.classList.add('hidden');
                if (prettyMessageElem) prettyMessageElem.classList.remove('hidden');
            }
        }

        /**
         * sets the format in which the text is shown
         *
         * @name   PasteViewer.setFormat
         * @function
         * @param {string} newFormat the new format
         */
        me.setFormat = function(newFormat)
        {
            // skip if there is no update
            if (format === newFormat) {
                return;
            }

            // needs to update display too, if we switch from or to Markdown
            if (format === 'markdown' || newFormat === 'markdown') {
                isDisplayed = false;
            }

            format = newFormat;
            isChanged = true;

            // update preview
            if (Editor.isPreview()) {
                PasteViewer.run();
            }
        };

        /**
         * returns the current format
         *
         * @name   PasteViewer.getFormat
         * @function
         * @return {string}
         */
        me.getFormat = function()
        {
            return format;
        };

        /**
         * returns whether the current view is pretty printed
         *
         * @name   PasteViewer.isPrettyPrinted
         * @function
         * @return {bool}
         */
        me.isPrettyPrinted = function()
        {
            return prettyPrintElem ? prettyPrintElem.classList.contains('prettyprinted') : false;
        };

        /**
         * sets the text to show
         *
         * @name   PasteViewer.setText
         * @function
         * @param {string} newText the text to show
         */
        me.setText = function(newText)
        {
            if (text !== newText) {
                text = newText;
                isChanged = true;
            }
        };

        /**
         * gets the current cached text
         *
         * @name   PasteViewer.getText
         * @function
         * @return {string}
         */
        me.getText = function()
        {
            return text;
        };

        /**
         * show/update the parsed text (preview)
         *
         * @name   PasteViewer.run
         * @function
         */
        me.run = function()
        {
            if (isChanged) {
                parsePaste();
                isChanged = false;
            }

            if (!isDisplayed) {
                showPaste();
                isDisplayed = true;
            }
        };

        /**
         * hide parsed text (preview)
         *
         * @name   PasteViewer.hide
         * @function
         */
        me.hide = function()
        {
            if (!isDisplayed) {
                return;
            }

            if (plainTextElem) plainTextElem.classList.add('hidden');
            if (prettyMessageElem) prettyMessageElem.classList.add('hidden');
            if (placeholderElem) placeholderElem.classList.add('hidden');
            AttachmentViewer.hideAttachmentPreview();

            isDisplayed = false;
        };

        /**
         * init status manager
         *
         * preloads jQuery elements
         *
         * @name   PasteViewer.init
         * @function
         */
        me.init = function()
        {
            const messageTab = document.getElementById('messagetab');
            if (messageTab) messageTabParentElem = messageTab.parentElement;
            placeholderElem = document.getElementById('placeholder');
            plainTextElem = document.getElementById('plaintext');
            prettyMessageElem = document.getElementById('prettymessage');
            prettyPrintElem = document.getElementById('prettyprint');

            // get default option from template/HTML or fall back to set value
            format = Model.getFormatDefault() || format;
            text = '';
            isDisplayed = false;
            isChanged = true;
        };

        return me;
    })();

    /**
     * (view) Show attachment and preview if possible
     *
     * @name   AttachmentViewer
     * @class
     */
    const AttachmentViewer = (function () {
        const me = {};

        let attachmentPreviewElem,
            attachmentElem,
            attachmentsData = [], // dataURLs
            files, // FileList from input or drop
            fileInputElem,
            dragAndDropFileNamesElem,
            dropzoneElem;

        /**
         * get blob URL from string data and mime type
         *
         * @name   AttachmentViewer.getBlobUrl
         * @private
         * @function
         * @param {string} data - raw data of attachment
         * @param {string} data - mime type of attachment
         * @return {string} objectURL
         */
         function getBlobUrl(data, mimeType)
         {
            // Transform into a Blob
            const buf = new Uint8Array(data.length);
            for (let i = 0; i < data.length; ++i) {
                buf[i] = data.charCodeAt(i);
            }
            const blob = new window.Blob(
                [buf],
                {
                    type: mimeType
                }
            );

            // Get blob URL
            return window.URL.createObjectURL(blob);
         }

         /**
         * sets the attachment but does not yet show it
         *
         * @name   AttachmentViewer.setAttachment
         * @function
         * @param {string} attachmentData - base64-encoded data of file
         * @param {string} fileName - optional, file name
         */
        me.setAttachment = function(attachmentData, fileName)
        {
            // skip, if attachments got disabled
            if (!attachmentElem || !attachmentPreviewElem) return;

            // data URI format: data:[<mimeType>][;base64],<data>

            const templateElement = Model.getTemplate('attachment'); // Assuming Model.getTemplate returns a DOM element
            if (!templateElement) return;
            const attachmentLinkElem = templateElement.querySelector('a');
            if (!attachmentLinkElem) return;

            // position in data URI string of where data begins
            const base64Start = attachmentData.indexOf(',') + 1;

            const mimeType = me.getAttachmentMimeType(attachmentData);

            // extract data and convert to binary
            const rawData = attachmentData.substring(base64Start);
            const decodedData = rawData.length > 0 ? atob(rawData) : '';

            let blobUrl = getBlobUrl(decodedData, mimeType);
            attachmentLinkElem.href = blobUrl;

            if (typeof fileName !== 'undefined') {
                attachmentLinkElem.download = fileName;
                templateElement.appendChild(document.createTextNode(' ' + fileName)); // Add space before filename
            }

            // sanitize SVG preview
            // prevents executing embedded scripts when CSP is not set and user
            // right-clicks/long-taps and opens the SVG in a new tab - prevented
            // in the preview by use of an img tag, which disables scripts, too
            if (mimeType.match(/^image\/.*svg/i)) {
                const sanitizedData = DOMPurify.sanitize(
                    decodedData,
                    purifySvgConfig
                );
                blobUrl = getBlobUrl(sanitizedData, mimeType);
            }

            templateElement.classList.remove('hidden');
            attachmentElem.appendChild(templateElement);

            me.handleBlobAttachmentPreview(attachmentPreviewElem, blobUrl, mimeType);
        };

        /**
         * displays the attachment
         *
         * @name AttachmentViewer.showAttachment
         * @function
         */
        me.showAttachment = function()
        {
            // skip, if attachments got disabled
            if (!attachmentElem || !attachmentPreviewElem) return;

            attachmentElem.classList.remove('hidden');

            if (me.hasAttachmentPreview()) {
                attachmentPreviewElem.classList.remove('hidden');
            }
        };

        /**
         * removes the attachment
         *
         * This automatically hides the attachment containers too, to
         * prevent an inconsistent display.
         *
         * @name AttachmentViewer.removeAttachment
         * @function
         */
        me.removeAttachment = function()
        {
            if (!attachmentElem) return;

            me.hideAttachment();
            me.hideAttachmentPreview();
            attachmentElem.innerHTML = '';
            if (attachmentPreviewElem) attachmentPreviewElem.innerHTML = '';
            if (dragAndDropFileNamesElem) dragAndDropFileNamesElem.innerHTML = '';

            me.removeAttachmentData(); // Clears internal `files` and `attachmentsData`
        };

        /**
         * removes the attachment data
         *
         * This removes the data, which would be uploaded otherwise.
         *
         * @name AttachmentViewer.removeAttachmentData
         * @function
         */
        me.removeAttachmentData = function()
        {
            files = undefined;
            attachmentsData = [];
        };

        /**
         * Cleares the drag & drop data.
         *
         * @name AttachmentViewer.clearDragAndDrop
         * @function
         */
        me.clearDragAndDrop = function()
        {
            if (dragAndDropFileNamesElem) dragAndDropFileNamesElem.innerHTML = '';
        };

        /**
         * Print file names added via drag & drop
         *
         * @name AttachmentViewer.printDragAndDropFileNames
         * @private
         * @function
         * @param {array} fileNames
         */
        function printDragAndDropFileNames(fileNames) {
            if (dragAndDropFileNamesElem) dragAndDropFileNamesElem.innerHTML = fileNames.join("<br>");
        }

        /**
         * hides the attachment
         *
         * This will not hide the preview (see AttachmentViewer.hideAttachmentPreview
         * for that) nor will it hide the attachment link if it was moved somewhere
         * else (see AttachmentViewer.moveAttachmentTo).
         *
         * @name AttachmentViewer.hideAttachment
         * @function
         */
        me.hideAttachment = function()
        {
            if (attachmentElem) attachmentElem.classList.add('hidden');
        };

        /**
         * hides the attachment preview
         *
         * @name AttachmentViewer.hideAttachmentPreview
         * @function
         */
        me.hideAttachmentPreview = function()
        {
            if (attachmentPreviewElem) {
                attachmentPreviewElem.classList.add('hidden');
            }
        };

        /**
         * checks if has any attachment preview
         *
         * @name AttachmentViewer.hasAttachmentPreview
         * @function
         * @return {JQuery}
         */
        me.hasAttachmentPreview = function()
        {
            return attachmentPreviewElem ? attachmentPreviewElem.children.length > 0 : false;
        }

        /**
         * checks if there is an attachment displayed
         *
         * @name   AttachmentViewer.hasAttachment
         * @function
         */
        me.hasAttachment = function()
        {
            return attachmentElem ? attachmentElem.children.length > 0 : false;
        };

        /**
         * checks if there is attachment data (for preview!) available
         *
         * It returns true, when there is data that needs to be encrypted.
         *
         * @name   AttachmentViewer.hasAttachmentData
         * @function
         */
        me.hasAttachmentData = function()
        {
            // This function seems to check if the attachment feature is enabled/present,
            // not if data is actually loaded. The actual check for data is `attachmentsData.length > 0`.
            // Keeping original logic but using the vanilla element.
            return !!attachmentElem;
        };

        /**
         * return the attachments
         *
         * @name   AttachmentViewer.getAttachments
         * @function
         * @returns {array}
         */
        me.getAttachments = function()
        {
            if (!attachmentElem) return [];
            return Array.from(attachmentElem.querySelectorAll('a')).map(link => (
                [
                    link.href,
                    link.download
                ]
            ));
        };

        /**
         * Get attachment mime type
         *
         * @name AttachmentViewer.getAttachmentMimeType
         * @function
         * @param {string} attachmentData - Base64 string
         */
        me.getAttachmentMimeType = function(attachmentData)
        {
            // position in data URI string of where mimeType ends
            const mimeTypeEnd = attachmentData.indexOf(';');

            // extract mimeType
            return attachmentData.substring(5, mimeTypeEnd);
        }

        /**
         * moves the attachment link to another element
         *
         * It is advisable to hide the attachment afterwards (AttachmentViewer.hideAttachment)
         *
         * @name   AttachmentViewer.moveAttachmentTo
         * @function
         * @param {jQuery} $element - the wrapper/container element where this should be moved to
         * @param {array} attachment - attachment data
         * @param {string} label - the text to show (%s will be replaced with the file name), will automatically be translated
         */
        me.moveAttachmentTo = function(parentElement, attachment, label)
        {
            if (!(parentElement instanceof Element)) {
                console.error('AttachmentViewer.moveAttachmentTo expects parentElement to be a DOM element.');
                return;
            }
            const attachmentLinkElem = document.createElement('a');
            attachmentLinkElem.classList.add('alert-link');
            attachmentLinkElem.href = attachment[0];
            attachmentLinkElem.download = attachment[1];

            // move elemement to new place
            parentElement.appendChild(attachmentLinkElem);

            // update text - ensuring no HTML is inserted into the text node
            I18n._(attachmentLinkElem, label, attachment[1]);
        };

        /**
         * read files data as data URL using the FileReader API
         *
         * @name   AttachmentViewer.readFileData
         * @private
         * @function
         * @param {FileList[]} loadedFiles (optional) loaded files array
         * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/FileReader#readAsDataURL()}
         */
        function readFileData(loadedFiles) {
            if (typeof FileReader === 'undefined') {
                // revert loading status…
                me.hideAttachment();
                me.hideAttachmentPreview();
                Alert.showWarning('Your browser does not support uploading encrypted files. Please use a newer browser.');
                return;
            }

            if (loadedFiles === undefined && fileInputElem && fileInputElem.files) {
                loadedFiles = Array.from(fileInputElem.files);
                me.clearDragAndDrop();
            } else if (loadedFiles) {
                const fileNames = loadedFiles.map((loadedFile => loadedFile.name));
                printDragAndDropFileNames(fileNames);
            }

            if (loadedFiles && loadedFiles.length > 0) {
                files = loadedFiles; // Store the FileList or array of files
                attachmentsData = []; // Reset for new files
                loadedFiles.forEach(loadedFile => {
                    const fileReader = new FileReader();

                    fileReader.onload = function (event) {
                        const dataURL = event.target.result;
                        if (dataURL) {
                            attachmentsData.push(dataURL);
                        }

                        if (Editor.isPreview() && attachmentPreviewElem) {
                            me.handleBlobAttachmentPreview(attachmentPreviewElem, dataURL, loadedFile.type); // Pass mimeType
                            attachmentPreviewElem.classList.remove('hidden');
                        }

                        TopNav.highlightFileupload();
                    };

                    fileReader.readAsDataURL(loadedFile);
                });
            } else {
                me.removeAttachmentData();
            }
        }

        /**
         * handle the preview of files decoded to blob that can either be an image, video, audio or pdf element
         *
         * @name   AttachmentViewer.handleBlobAttachmentPreview
         * @function
         * @argument {Element} targetElement element where the preview should be appended
         * @argument {string} dataUrl file as a data URL or blob URL
         * @argument {string} mimeType
         */
        me.handleBlobAttachmentPreview = function (targetElement, dataUrl, mimeType) {
            if (!targetElement || !dataUrl) return;

            // Prevent adding the same preview multiple times if this function is called repeatedly with the same URL
            if (targetElement.querySelector(`[src="${dataUrl}"]`)) return;

            let previewElement = null;

            if (mimeType.startsWith('image/')) {
                previewElement = document.createElement('img');
                previewElement.src = dataUrl;
                previewElement.className = 'img-thumbnail';
            } else if (mimeType.startsWith('video/')) {
                previewElement = document.createElement('video');
                previewElement.controls = true;
                previewElement.autoplay = true; // Consider if autoplay is desired
                previewElement.className = 'img-thumbnail';
                const source = document.createElement('source');
                source.type = mimeType;
                source.src = dataUrl;
                previewElement.appendChild(source);
            } else if (mimeType.startsWith('audio/')) {
                previewElement = document.createElement('audio');
                previewElement.controls = true;
                previewElement.autoplay = true; // Consider if autoplay is desired
                const source = document.createElement('source');
                source.type = mimeType;
                source.src = dataUrl;
                previewElement.appendChild(source);
            } else if (mimeType === 'application/pdf') {
                previewElement = document.createElement('embed');
                previewElement.src = dataUrl;
                previewElement.type = 'application/pdf';
                previewElement.className = 'pdfPreview';
                previewElement.style.height = window.innerHeight + 'px'; // Consider a more robust height
            }

            if (previewElement) {
                // Clear previous previews if only one is desired at a time
                // targetElement.innerHTML = ''; // Uncomment if only one preview should be shown
                targetElement.appendChild(previewElement);
            }
        };

        /**
         * attaches the file attachment drag & drop handler to the page
         *
         * @name   AttachmentViewer.addDragDropHandler
         * @private
         * @function
         */
        function addDragDropHandler() {
            if (!fileInputElem || !dropzoneElem) return;

            let dragCounter = 0;

            document.addEventListener('dragenter', function(event) {
                event.stopPropagation();
                event.preventDefault();
                if (TopNav.isAttachmentReadonly()) return;
                dragCounter++;
                dropzoneElem.classList.remove('hidden');
            }, false);

            document.addEventListener('dragleave', function(event) {
                event.stopPropagation();
                event.preventDefault();
                if (TopNav.isAttachmentReadonly()) return;
                dragCounter--;
                if (dragCounter === 0) {
                    dropzoneElem.classList.add('hidden');
                }
            }, false);

            document.addEventListener('dragover', function(event) {
                event.stopPropagation();
                event.preventDefault(); // Necessary to allow drop.
                if (TopNav.isAttachmentReadonly()) {
                    event.dataTransfer.dropEffect = 'none';
                } else {
                    event.dataTransfer.dropEffect = 'copy'; // Show a copy icon
                }
            }, false);

            document.addEventListener('drop', function(event) {
                event.stopPropagation();
                event.preventDefault();
                dragCounter = 0; // Reset counter
                dropzoneElem.classList.add('hidden');

                if (TopNav.isAttachmentReadonly()) return;

                const droppedFiles = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
                if (droppedFiles.length > 0) {
                    fileInputElem.value = null; // Clear any selected file in input
                    readFileData(droppedFiles);
                }
            }, false);

            fileInputElem.addEventListener('change', function (event) {
                readFileData(Array.from(event.target.files));
            });
        }

        /**
         * attaches the clipboard attachment handler to the page
         *
         * @name   AttachmentViewer.addClipboardEventHandler
         * @private
         * @function
         */
        function addClipboardEventHandler() {
            document.addEventListener('paste', function (event) {
                if (TopNav.isAttachmentReadonly()) return;

                const items = (event.clipboardData || window.clipboardData)?.items;
                if (!items) return;

                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile();
                        if (file) {
                            readFileData([file]); // Pass as an array
                            event.preventDefault(); // Prevent pasting file path as text
                            return;
                        }
                    }
                }
            });
        }


        /**
         * getter for attachment data
         *
         * @name   AttachmentViewer.getAttachmentsData
         * @function
         * @return {string[]}
         */
        me.getAttachmentsData = function () {
            return attachmentsData;
        };

        /**
         * getter for attachment preview
         *
         * @name   AttachmentViewer.getAttachmentPreview
         * @function
         * @return {jQuery}
         */
        me.getAttachmentPreview = function () {
            return attachmentPreviewElem;
        };

        /**
         * getter for files data, returns the file list
         *
         * @name   AttachmentViewer.getFiles
         * @function
         * @return {FileList[]}
         */
        me.getFiles = function () {
            return files;
        };

        /**
         * initiate
         *
         * preloads jQuery elements
         *
         * @name   AttachmentViewer.init
         * @function
         */
        me.init = function()
        {
            attachmentElem = document.getElementById('attachment');
            dragAndDropFileNamesElem = document.getElementById('dragAndDropFileName');
            dropzoneElem = document.getElementById('dropzone');

            if(attachmentElem) { // Only init further if main attachment element exists
                attachmentPreviewElem = document.getElementById('attachmentPreview');
                fileInputElem = document.getElementById('file');

                if (fileInputElem) { // Drag & drop and clipboard only make sense if there's a file input
                    addDragDropHandler();
                    addClipboardEventHandler();
                }
            }
        }

        return me;
    })();

    /**
     * (view) Shows discussion thread and handles replies
     *
     * @name   DiscussionViewer
     * @class
     */
    const DiscussionViewer = (function () {
        const me = {};

        let commentTailTemplate,
            discussionElement,
            replyElement,
            replyMessageElement,
            replyNicknameElement,
            replyStatusElement,
            commentContainerElement,
            replyCommentId;

        /**
         * initializes the templates
         *
         * @name   DiscussionViewer.initTemplates
         * @private
         * @function
         */
        function initTemplates()
        {
            replyElement = Model.getTemplate('reply');
            if (replyElement) {
                replyMessageElement = replyElement.querySelector('#replymessage');
                replyNicknameElement = replyElement.querySelector('#nickname');
                replyStatusElement = replyElement.querySelector('#replystatus');
                const sendButton = replyElement.querySelector('button'); // Assuming one button for sending
                if (sendButton) {
                    sendButton.addEventListener('click', PasteEncrypter.sendComment);
                }
            }

            commentTailTemplate = Model.getTemplate('commenttail');
            // The 'openReply' listener for commentTailTemplate's button is added in init()
            // as it's a static part of the page structure, not dynamically added per comment.
        }

        /**
         * open the comment entry when clicking the "Reply" button of a comment
         *
         * @name   DiscussionViewer.openReply
         * @private
         * @function
         * @param  {Event} event
         */
        function openReply(event)
        {
            const sourceElement = event.target;

            // show all reply buttons
            if (commentContainerElement) {
                commentContainerElement.querySelectorAll('button').forEach(btn => btn.classList.remove('hidden'));
            }

            // hide the current reply button
            sourceElement.classList.add('hidden');

            // clear input
            if (replyMessageElement) replyMessageElement.value = '';
            if (replyNicknameElement) replyNicknameElement.value = '';

            // get comment id from source element
            if (sourceElement.parentElement) {
                replyCommentId = sourceElement.parentElement.id.split('_')[1];
            }

            // move to correct position
            if (replyElement) { // Ensure replyElement exists
                sourceElement.after(replyElement);
                 // show
                replyElement.classList.remove('hidden');
                if (replyMessageElement) replyMessageElement.focus();
            }


            event.preventDefault();
        }

        /**
         * custom handler for displaying notifications in own status message area
         *
         * @name   DiscussionViewer.handleNotification
         * @function
         * @param  {string} alertType
         * @return {bool|Element}
         */
        me.handleNotification = function(alertType)
        {
            // ignore loading messages
            if (alertType === 'loading' || !replyStatusElement) {
                return false;
            }

            const iconElement = replyStatusElement.querySelector(':first-child'); // Assuming icon is the first child
            if (alertType === 'danger') {
                replyStatusElement.classList.remove('alert-info');
                replyStatusElement.classList.add('alert-danger');
                if (iconElement) {
                    iconElement.classList.remove('glyphicon-alert'); // Default or previous info icon
                    iconElement.classList.add('glyphicon-info-sign'); // Error specific icon
                }
            } else { // Assuming 'info' or other non-danger types
                replyStatusElement.classList.remove('alert-danger');
                replyStatusElement.classList.add('alert-info');
                if (iconElement) {
                    iconElement.classList.remove('glyphicon-info-sign'); // Previous error icon
                    iconElement.classList.add('glyphicon-alert');    // Default/info icon
                }
            }

            return replyStatusElement;
        };

        /**
         * adds another comment
         *
         * @name   DiscussionViewer.addComment
         * @function
         * @param {Comment} comment
         * @param {string} commentText
         * @param {string} nickname
         */
        me.addComment = function(comment, commentText, nickname)
        {
            if (commentText === '') {
                commentText = 'comment decryption failed';
            }

            // create new comment based on template
            const commentEntryElement = Model.getTemplate('comment');
            if (!commentEntryElement) return; // Guard against null template

            commentEntryElement.id = 'comment_' + comment.id;
            const commentEntryDataElement = commentEntryElement.querySelector('div.commentdata');

            // set & parse text
            if (commentEntryDataElement) {
                commentEntryDataElement.textContent = commentText;
                Helper.urls2links(commentEntryDataElement);
            }

            // set nickname
            const nicknameSpan = commentEntryElement.querySelector('span.nickname');
            if (nicknameSpan) {
                if (nickname && nickname.length > 0) {
                    nicknameSpan.textContent = nickname;
                } else {
                    nicknameSpan.innerHTML = '<i></i>';
                    const italicElement = nicknameSpan.querySelector('i');
                    if (italicElement) I18n._(italicElement, 'Anonymous');
                }
            }

            // set date
            const created = comment.getCreated();
            const commentDate = created == 0 ? '' : ' (' + (new Date(created * 1000).toLocaleString()) + ')';
            const dateSpan = commentEntryElement.querySelector('span.commentdate');
            if (dateSpan) {
                dateSpan.textContent = commentDate;
                dateSpan.title = 'CommentID: ' + comment.id;
            }

            // if an avatar is available, display it
            const icon = comment.getIcon();
            if (icon && nicknameSpan) {
                const img = document.createElement('img');
                img.src = icon;
                img.className = 'vizhash';
                nicknameSpan.insertAdjacentElement('beforebegin', img);
                img.insertAdjacentText('afterend', ' '); // Add space after image

                // The event listener for languageLoaded should be on document,
                // and it will re-translate all relevant elements.
                // If specific update is needed for this new element:
                document.addEventListener('languageLoaded', function updateTitle() {
                    const vizhashImg = commentEntryElement.querySelector('img.vizhash');
                    if (vizhashImg) {
                        vizhashImg.title = I18n._('Avatar generated from IP address');
                    }
                    // Optionally remove listener if it only needs to run once for this element
                    // document.removeEventListener('languageLoaded', updateTitle);
                });
            }

            // Add reply button listener for this specific comment
            const replyButton = commentEntryElement.querySelector('button.replybutton'); // Assuming a class 'replybutton'
            if (replyButton) {
                replyButton.addEventListener('click', openReply);
            }


            // starting point (default value/fallback)
            let placeElement = commentContainerElement;

            // if parent comment exists
            const parentCommentElement = document.getElementById('comment_' + comment.parentid);
            if (parentCommentElement) {
                // use parent as position for new comment, so it is shifted
                // to the right
                placeElement = parentCommentElement;
            }

            // finally append comment
            if (placeElement) placeElement.append(commentEntryElement);
        };

        /**
         * finishes the discussion area after last comment
         *
         * @name   DiscussionViewer.finishDiscussion
         * @function
         */
        me.finishDiscussion = function()
        {
            // add 'add new comment' area
            if (commentContainerElement && commentTailTemplate) {
                commentContainerElement.append(commentTailTemplate);
            }

            // show discussions
            if (discussionElement) discussionElement.classList.remove('hidden');
        };

        /**
         * removes the old discussion and prepares everything for creating a new
         * one.
         *
         * @name   DiscussionViewer.prepareNewDiscussion
         * @function
         */
        me.prepareNewDiscussion = function()
        {
            if (commentContainerElement) commentContainerElement.innerHTML = '';
            if (discussionElement) discussionElement.classList.add('hidden');

            // (re-)init templates
            initTemplates();
        };

        /**
         * returns the users message from the reply form
         *
         * @name   DiscussionViewer.getReplyMessage
         * @function
         * @return {String}
         */
        me.getReplyMessage = function()
        {
            return replyMessageElement ? replyMessageElement.value : '';
        };

        /**
         * returns the users nickname (if any) from the reply form
         *
         * @name   DiscussionViewer.getReplyNickname
         * @function
         * @return {String}
         */
        me.getReplyNickname = function()
        {
            return replyNicknameElement ? replyNicknameElement.value : '';
        };

        /**
         * returns the id of the parent comment the user is replying to
         *
         * @name   DiscussionViewer.getReplyCommentId
         * @function
         * @return {int|undefined}
         */
        me.getReplyCommentId = function()
        {
            return replyCommentId;
        };

        /**
         * highlights a specific comment and scrolls to it if necessary
         *
         * @name   DiscussionViewer.highlightComment
         * @function
         * @param {string} commentId
         * @param {bool} fadeOut - whether to fade out the comment
         */
        me.highlightComment = function(commentId, fadeOut)
        {
            const commentElement = document.getElementById('comment_' + commentId);
            // in case comment does not exist, cancel
            if (!commentElement) {
                return;
            }

            commentElement.classList.add('highlight');
            const highlightComment = function () {
                if (fadeOut === true) {
                    setTimeout(function () {
                        commentElement.classList.remove('highlight');
                    }, 300);
                }
            };

            if (UiHelper.isVisible(commentElement)) {
                return highlightComment();
            }

            UiHelper.scrollTo(commentElement, 100, 'swing', highlightComment);
        };

        /**
         * initiate
         *
         * preloads jQuery elements
         *
         * @name   DiscussionViewer.init
         * @function
         */
        me.init = function()
        {
            // The main reply form's button listener is added in initTemplates.
            // Listeners for dynamically added "Reply" buttons in comments are added in addComment.
            // The "Reply" button in the comment tail (if it's static and not part of a cloned template)
            // needs its listener here.
            const commentTailTemplateElement = Model.getTemplate('commenttailtemplate');
            if (commentTailTemplateElement) {
                const tailReplyButton = commentTailTemplateElement.querySelector('button'); // Assuming one button
                if (tailReplyButton) {
                    tailReplyButton.addEventListener('click', openReply);
                }
            }
            // Note: If 'commenttemplate' also has a static button that needs openReply, handle similarly.
            // However, usually 'commenttemplate' is for dynamic comments, handled in addComment.

            commentContainerElement = document.getElementById('commentcontainer');
            discussionElement = document.getElementById('discussion');
        };

        return me;
    })();

    /**
     * Manage top (navigation) bar
     *
     * @name   TopNav
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    const TopNav = (function (window, document) {
        const me = {};

        let createButtonsDisplayed = false,
            viewButtonsDisplayed = false,
            burnAfterReadingDefault = false,
            openDiscussionDefault = false,
            attachElement,
            burnAfterReadingCheckbox,
            burnAfterReadingOptionElement,
            cloneButtonElement,
            customAttachmentElement,
            expirationElement,
            fileRemoveButtonElement,
            fileWrapElement,
            formatterElement,
            newButtonElement,
            openDiscussionCheckbox,
            openDiscussionOptionElement,
            passwordContainerElement, // Renamed from $password to avoid confusion
            passwordInputElement,
            rawTextButtonElement,
            downloadTextButtonElement,
            qrCodeLinkElement,
            emailLinkElement,
            sendButtonElement,
            retryButtonElement,
            pasteExpiration = null,
            retryButtonCallback;

        /**
         * set the expiration on bootstrap templates in dropdown
         *
         * @name   TopNav.updateExpiration
         * @private
         * @function
         * @param  {Event} event
         */
        function updateExpiration(event)
        {
            const target = event.target;
            const pasteExpirationDisplay = document.getElementById('pasteExpirationDisplay');
            if (pasteExpirationDisplay) {
                pasteExpirationDisplay.textContent = target.textContent;
            }
            pasteExpiration = target.dataset.expiration;
            event.preventDefault();
        }

        /**
         * set the format on bootstrap templates in dropdown from user interaction
         *
         * @name   TopNav.updateFormat
         * @private
         * @function
         * @param  {Event} event
         */
        function updateFormat(event)
        {
            const target = event.target;
            const pasteFormatterDisplay = document.getElementById('pasteFormatterDisplay');
            if (pasteFormatterDisplay) {
                pasteFormatterDisplay.textContent = target.textContent;
            }
            const newFormat = target.dataset.format;
            PasteViewer.setFormat(newFormat);
            event.preventDefault();
        }

        /**
         * when "burn after reading" is checked, disable discussion
         *
         * @name   TopNav.changeBurnAfterReading
         * @private
         * @function
         */
        function changeBurnAfterReading()
        {
            if (me.getBurnAfterReading()) {
                if (openDiscussionOptionElement) openDiscussionOptionElement.classList.add('buttondisabled');
                if (openDiscussionCheckbox) openDiscussionCheckbox.checked = false;
                if (burnAfterReadingOptionElement) burnAfterReadingOptionElement.classList.remove('buttondisabled');
            } else {
                if (openDiscussionOptionElement) openDiscussionOptionElement.classList.remove('buttondisabled');
            }
        }

        /**
         * when discussion is checked, disable "burn after reading"
         *
         * @name   TopNav.changeOpenDiscussion
         * @private
         * @function
         */
        function changeOpenDiscussion()
        {
            if (me.getOpenDiscussion()) {
                if (burnAfterReadingOptionElement) burnAfterReadingOptionElement.classList.add('buttondisabled');
                if (burnAfterReadingCheckbox) burnAfterReadingCheckbox.checked = false;
                if (openDiscussionOptionElement) openDiscussionOptionElement.classList.remove('buttondisabled');
            } else {
                if (burnAfterReadingOptionElement) burnAfterReadingOptionElement.classList.remove('buttondisabled');
            }
        }

        /**
         * Clear the password input in the top navigation
         *
         * @name TopNav.clearPasswordInput
         * @function
         */
        function clearPasswordInput()
        {
            if (passwordInputElement) passwordInputElement.value = '';
        }

        /**
         * Clear the attachment input in the top navigation.
         *
         * @name   TopNav.clearAttachmentInput
         * @function
         */
        function clearAttachmentInput()
        {
            if (fileWrapElement) {
                const inputElement = fileWrapElement.querySelector('input');
                if (inputElement) inputElement.value = '';
            }
        }

        /**
         * return raw text
         *
         * @name   TopNav.rawText
         * @private
         * @function
         */
        function rawText()
        {
            TopNav.hideAllButtons();
            Alert.showLoading('Showing raw text…', 'time');
            let paste = PasteViewer.getText();

            history.pushState(
                {type: 'raw'},
                document.title,
                Helper.baseUri() + '?' + Model.getPasteId() + '#' +
                CryptTool.base58encode(Model.getPasteKey())
            );

            const headChildren = Array.from(document.head.children).filter(
                child => !['NOSCRIPT', 'SCRIPT'].includes(child.tagName.toUpperCase()) &&
                         !(child.tagName.toUpperCase() === 'LINK' && child.getAttribute('type') === 'text/css')
            );
            const newDoc = document.open('text/html', 'replace');
            newDoc.write('<!DOCTYPE html><html><head>');
            headChildren.forEach(child => newDoc.write(child.outerHTML));
            newDoc.write(
                '</head><body><pre>' +
                DOMPurify.sanitize(
                    Helper.htmlEntities(paste),
                    purifyHtmlConfig
                ) +
                '</pre></body></html>'
            );
            newDoc.close();
        }

        /**
         * download text
         *
         * @name   TopNav.downloadText
         * @private
         * @function
         */
        function downloadText()
        {
            var fileFormat = PasteViewer.getFormat() === 'markdown' ? '.md' : '.txt';
            var filename='paste-' + Model.getPasteId() + fileFormat;
            var text = PasteViewer.getText();

            var element = document.createElement('a');
            element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            element.setAttribute('download', filename);

            element.style.display = 'none';
            document.body.appendChild(element);

            element.click();

            document.body.removeChild(element);
        }

        /**
         * saves the language in a cookie and reloads the page
         *
         * @name   TopNav.setLanguage
         * @private
         * @function
         * @param  {Event} event
         */
        function setLanguage(event)
        {
            let lang = event.target.dataset.lang || event.target.value;
            document.cookie = 'lang=' + lang + '; SameSite=Lax; Secure';
            window.location.reload();
            event.preventDefault();
        }

        /**
         * save the template in a cookie and reloads the page
         *
         * @name TopNav.setTemplate
         * @private
         * @function
         * @param {Event} event
         */
        function setTemplate(event)
        {
            let template = event.target.dataset.template || event.target.value;
            document.cookie = 'template=' + template + '; SameSite=Lax; Secure';
            window.location.reload();
            event.preventDefault();
        }

        /**
         * hides all messages and creates a new paste
         *
         * @name   TopNav.clickNewPaste
         * @private
         * @function
         */
        function clickNewPaste()
        {
            Controller.hideStatusMessages();
            Controller.newPaste();
        }

        /**
         * retrys some callback registered before
         *
         * @name   TopNav.clickRetryButton
         * @private
         * @function
         * @param  {Event} event
         */
        function clickRetryButton(event)
        {
            if (typeof retryButtonCallback === 'function') {
                retryButtonCallback(event);
            }
        }

        /**
         * removes the existing attachment
         *
         * @name   TopNav.removeAttachment
         * @private
         * @function
         * @param  {Event} event
         */
        function removeAttachment(event)
        {
            if (customAttachmentElement && !customAttachmentElement.classList.contains('hidden')) {
                AttachmentViewer.removeAttachment();
                customAttachmentElement.classList.add('hidden');
                if (fileWrapElement) fileWrapElement.classList.remove('hidden');
            }

            AttachmentViewer.removeAttachmentData();
            clearAttachmentInput();
            AttachmentViewer.clearDragAndDrop();
            event.preventDefault();
        }

        /**
         * Shows the QR code of the current paste (URL).
         *
         * @name   TopNav.displayQrCode
         * @private
         * @function
         */
        function displayQrCode()
        {
            const qrCanvas = kjua({
                render: 'canvas',
                text: window.location.href
            });
            const qrCodeDisplay = document.getElementById('qrcode-display');
            if (qrCodeDisplay) {
                qrCodeDisplay.innerHTML = ''; // Clear previous QR code
                qrCodeDisplay.appendChild(qrCanvas);
            }
        }

        /**
         * Template Email body.
         *
         * @name   TopNav.templateEmailBody
         * @private
         * @param {string} expirationDateString
         * @param {bool} isBurnafterreading
         */
        function templateEmailBody(expirationDateString, isBurnafterreading)
        {
            const EOL = '\n';
            const BULLET = '  - ';
            let emailBody = '';
            if (expirationDateString !== null || isBurnafterreading) {
                emailBody += I18n._('Notice:');
                emailBody += EOL;

                if (expirationDateString !== null) {
                    emailBody += EOL;
                    emailBody += BULLET;
                    emailBody += Helper.sprintf(
                        I18n._(
                            'This link will expire after %s.',
                            '%s'
                        ),
                        expirationDateString
                    );
                }
                if (isBurnafterreading) {
                    emailBody += EOL;
                    emailBody += BULLET;
                    emailBody += I18n._(
                        'This link can only be accessed once, do not use back or refresh button in your browser.'
                    );
                }
                emailBody += EOL;
                emailBody += EOL;
            }
            emailBody += I18n._('Link:');
            emailBody += EOL;
            const pasteUrl = document.getElementById('pasteurl');
            emailBody += (pasteUrl ? pasteUrl.getAttribute('href') : null) || window.location.href;
            return emailBody;
        }

        /**
         * Trigger Email send.
         *
         * @name   TopNav.triggerEmailSend
         * @private
         * @param {string} emailBody
         */
        function triggerEmailSend(emailBody)
        {
            window.open(
                `mailto:?body=${encodeURIComponent(emailBody)}`,
                '_self',
                'noopener, noreferrer'
            );
        }

        /**
         * Send Email with current paste (URL).
         *
         * @name   TopNav.sendEmail
         * @private
         * @function
         * @param  {Date|null} expirationDate date of expiration
         * @param  {bool} isBurnafterreading whether it is burn after reading
         */
        function sendEmail(expirationDate, isBurnafterreading)
        {
            const expirationDateRoundedToSecond = new Date(expirationDate);
            expirationDateRoundedToSecond.setUTCSeconds(
                expirationDateRoundedToSecond.getUTCSeconds() - 30
            );
            expirationDateRoundedToSecond.setUTCSeconds(0);

            const emailConfirmModalElement = document.getElementById('emailconfirmmodal');
            if (emailConfirmModalElement) {
                if (expirationDate !== null) {
                    const emailConfirmTimezoneCurrent = emailConfirmModalElement.querySelector('#emailconfirm-timezone-current');
                    const emailConfirmTimezoneUtc = emailConfirmModalElement.querySelector('#emailconfirm-timezone-utc');
                    let localeConfiguration = { dateStyle: 'long', timeStyle: 'long' };
                    const bootstrap5EmailConfirmModal = (typeof bootstrap !== 'undefined' && bootstrap.Modal) ?
                        bootstrap.Modal.getOrCreateInstance(emailConfirmModalElement) : null;

                    const sendEmailAndHideModalCurrent = () => { // Renamed to avoid conflict
                        const currentLocaleConfig = {...localeConfiguration}; // Use a copy
                        const emailBody = templateEmailBody(
                            expirationDateRoundedToSecond.toLocaleString([], currentLocaleConfig),
                            isBurnafterreading
                        );
                        if (bootstrap5EmailConfirmModal) bootstrap5EmailConfirmModal.hide();
                        triggerEmailSend(emailBody);
                        if (emailConfirmTimezoneCurrent) emailConfirmTimezoneCurrent.removeEventListener('click', sendEmailAndHideModalCurrent);
                        if (emailConfirmTimezoneUtc) emailConfirmTimezoneUtc.removeEventListener('click', sendEmailAndHideModalUtc);
                    };

                    const sendEmailAndHideModalUtc = () => { // Renamed to avoid conflict
                        const utcLocaleConfig = {...localeConfiguration, timeZone: 'UTC'}; // Use a copy
                        const emailBody = templateEmailBody(
                            expirationDateRoundedToSecond.toLocaleString([], utcLocaleConfig),
                            isBurnafterreading
                        );
                        if (bootstrap5EmailConfirmModal) bootstrap5EmailConfirmModal.hide();
                        triggerEmailSend(emailBody);
                        if (emailConfirmTimezoneCurrent) emailConfirmTimezoneCurrent.removeEventListener('click', sendEmailAndHideModalCurrent);
                        if (emailConfirmTimezoneUtc) emailConfirmTimezoneUtc.removeEventListener('click', sendEmailAndHideModalUtc);
                    };


                    if (emailConfirmTimezoneCurrent) {
                        emailConfirmTimezoneCurrent.removeEventListener('click', sendEmailAndHideModalCurrent); // Remove previous before adding
                        emailConfirmTimezoneCurrent.addEventListener('click', sendEmailAndHideModalCurrent);
                    }
                    if (emailConfirmTimezoneUtc) {
                        emailConfirmTimezoneUtc.removeEventListener('click', sendEmailAndHideModalUtc); // Remove previous before adding
                        emailConfirmTimezoneUtc.addEventListener('click', sendEmailAndHideModalUtc);
                    }

                    if (bootstrap5EmailConfirmModal) bootstrap5EmailConfirmModal.show();
                } else {
                    triggerEmailSend(templateEmailBody(null, isBurnafterreading));
                }
            } else {
                let emailBody = '';
                if (expirationDate !== null) {
                    const expirationDateString = window.confirm(
                        I18n._('Recipient may become aware of your timezone, convert time to UTC?')
                    ) ? expirationDateRoundedToSecond.toLocaleString(
                        undefined,
                        { timeZone: 'UTC', dateStyle: 'long', timeStyle: 'long' }
                    ) : expirationDateRoundedToSecond.toLocaleString();
                    emailBody = templateEmailBody(expirationDateString, isBurnafterreading);
                } else {
                    emailBody = templateEmailBody(null, isBurnafterreading);
                }
                triggerEmailSend(emailBody);
            }
        }

        /**
         * Shows all navigation elements for viewing an existing paste
         *
         * @name   TopNav.showViewButtons
         * @function
         */
        me.showViewButtons = function()
        {
            if (viewButtonsDisplayed) return;
            if (newButtonElement) newButtonElement.classList.remove('hidden');
            if (cloneButtonElement) cloneButtonElement.classList.remove('hidden');
            if (rawTextButtonElement) rawTextButtonElement.classList.remove('hidden');
            if (downloadTextButtonElement) downloadTextButtonElement.classList.remove('hidden');
            if (qrCodeLinkElement) qrCodeLinkElement.classList.remove('hidden');
            viewButtonsDisplayed = true;
        };

        /**
         * Hides all navigation elements for viewing an existing paste
         *
         * @name   TopNav.hideViewButtons
         * @function
         */
        me.hideViewButtons = function()
        {
            if (!viewButtonsDisplayed) return;
            if (cloneButtonElement) cloneButtonElement.classList.add('hidden');
            if (newButtonElement) newButtonElement.classList.add('hidden');
            if (rawTextButtonElement) rawTextButtonElement.classList.add('hidden');
            if (downloadTextButtonElement) downloadTextButtonElement.classList.add('hidden');
            if (qrCodeLinkElement) qrCodeLinkElement.classList.add('hidden');
            me.hideEmailButton();
            viewButtonsDisplayed = false;
        };

        /**
         * Hides all elements belonging to existing pastes
         *
         * @name   TopNav.hideAllButtons
         * @function
         */
        me.hideAllButtons = function()
        {
            me.hideViewButtons();
            me.hideCreateButtons();
        };

        /**
         * shows all elements needed when creating a new paste
         *
         * @name   TopNav.showCreateButtons
         * @function
         */
        me.showCreateButtons = function()
        {
            if (createButtonsDisplayed) return;
            if (attachElement) attachElement.classList.remove('hidden');
            if (burnAfterReadingOptionElement) burnAfterReadingOptionElement.classList.remove('hidden');
            if (expirationElement) expirationElement.classList.remove('hidden');
            if (formatterElement) formatterElement.classList.remove('hidden');
            if (newButtonElement) newButtonElement.classList.remove('hidden');
            if (openDiscussionOptionElement) openDiscussionOptionElement.classList.remove('hidden');
            if (passwordContainerElement) passwordContainerElement.classList.remove('hidden');
            if (sendButtonElement) sendButtonElement.classList.remove('hidden');
            createButtonsDisplayed = true;
        };

        /**
         * shows all elements needed when creating a new paste
         *
         * @name   TopNav.hideCreateButtons
         * @function
         */
        me.hideCreateButtons = function()
        {
            if (!createButtonsDisplayed) return;
            if (newButtonElement) newButtonElement.classList.add('hidden');
            if (sendButtonElement) sendButtonElement.classList.add('hidden');
            if (expirationElement) expirationElement.classList.add('hidden');
            if (formatterElement) formatterElement.classList.add('hidden');
            if (burnAfterReadingOptionElement) burnAfterReadingOptionElement.classList.add('hidden');
            if (openDiscussionOptionElement) openDiscussionOptionElement.classList.add('hidden');
            if (passwordContainerElement) passwordContainerElement.classList.add('hidden');
            if (attachElement) attachElement.classList.add('hidden');
            createButtonsDisplayed = false;
        };

        /**
         * only shows the "new paste" button
         *
         * @name   TopNav.showNewPasteButton
         * @function
         */
        me.showNewPasteButton = function()
        {
            if (newButtonElement) newButtonElement.classList.remove('hidden');
        };

        /**
         * only shows the "retry" button
         *
         * @name   TopNav.showRetryButton
         * @function
         */
        me.showRetryButton = function()
        {
            if (retryButtonElement) retryButtonElement.classList.remove('hidden');
        }

        /**
         * hides the "retry" button
         *
         * @name   TopNav.hideRetryButton
         * @function
         */
        me.hideRetryButton = function()
        {
            if (retryButtonElement) retryButtonElement.classList.add('hidden');
        }

        /**
         * show the "email" button
         *
         * @name   TopNav.showEmailbutton
         * @function
         * @param {int|undefined} optionalRemainingTimeInSeconds
         */
        me.showEmailButton = function(optionalRemainingTimeInSeconds)
        {
            try {
                const expirationDate = Helper.calculateExpirationDate(
                    new Date(),
                    typeof optionalRemainingTimeInSeconds === 'number' ? optionalRemainingTimeInSeconds : TopNav.getExpiration()
                );
                const isBurnafterreading = TopNav.getBurnAfterReading();

                if (emailLinkElement) {
                    emailLinkElement.classList.remove('hidden');
                    // Remove potential old listener before adding a new one to prevent multiple executions
                    const newEmailLinkElement = emailLinkElement.cloneNode(true); // Clone to remove all listeners
                    emailLinkElement.parentNode.replaceChild(newEmailLinkElement, emailLinkElement);
                    emailLinkElement = newEmailLinkElement; // Update reference
                    emailLinkElement.addEventListener('click', () => {
                        sendEmail(expirationDate, isBurnafterreading);
                    });
                }
            } catch (error) {
                console.error(error);
                Alert.showError('Cannot calculate expiration date.');
            }
        }

        /**
         * hide the "email" button
         *
         * @name   TopNav.hideEmailButton
         * @function
         */
        me.hideEmailButton = function()
        {
            if (emailLinkElement) {
                emailLinkElement.classList.add('hidden');
                // To remove the specific listener, we'd need to store the function reference.
                // Or, replace the element with a clone if we want to remove all listeners.
                // For simplicity, if multiple listeners aren't an issue, this is fine.
                // If they are, cloning is a robust way:
                // const newEmailLinkElement = emailLinkElement.cloneNode(true);
                // emailLinkElement.parentNode.replaceChild(newEmailLinkElement, emailLinkElement);
                // emailLinkElement = newEmailLinkElement;
            }
        }

        /**
         * only hides the clone button
         *
         * @name   TopNav.hideCloneButton
         * @function
         */
        me.hideCloneButton = function()
        {
            if (cloneButtonElement) cloneButtonElement.classList.add('hidden');
        };

        /**
         * only hides the raw text button
         *
         * @name   TopNav.hideRawButton
         * @function
         */
        me.hideRawButton = function()
        {
            if (rawTextButtonElement) rawTextButtonElement.classList.add('hidden');
        };

        /**
         * only hides the download text button
         *
         * @name   TopNav.hideDownloadButton
         * @function
         */
        me.hideDownloadButton = function()
        {
            if (downloadTextButtonElement) downloadTextButtonElement.classList.add('hidden');
        };

        /**
         * only hides the qr code button
         *
         * @name   TopNav.hideQrCodeButton
         * @function
         */
        me.hideQrCodeButton = function()
        {
            if (qrCodeLinkElement) qrCodeLinkElement.classList.add('hidden');
        }

        /**
         * hide all irrelevant buttons when viewing burn after reading paste
         *
         * @name   TopNav.hideBurnAfterReadingButtons
         * @function
         */
        me.hideBurnAfterReadingButtons = function()
        {
            me.hideCloneButton();
            me.hideQrCodeButton();
            me.hideEmailButton();
        }

        /**
         * hides the file selector in attachment
         *
         * @name   TopNav.hideFileSelector
         * @function
         */
        me.hideFileSelector = function()
        {
            if (fileWrapElement) fileWrapElement.classList.add('hidden');
        };


        /**
         * shows the custom attachment
         *
         * @name   TopNav.showCustomAttachment
         * @function
         */
        me.showCustomAttachment = function()
        {
            if (customAttachmentElement) customAttachmentElement.classList.remove('hidden');
        };

        /**
         * hides the custom attachment
         *
         * @name  TopNav.hideCustomAttachment
         * @function
         */
        me.hideCustomAttachment = function()
        {
            if (customAttachmentElement) customAttachmentElement.classList.add('hidden');
            if (fileWrapElement) fileWrapElement.classList.remove('hidden');
        };

        /**
         * collapses the navigation bar, only if expanded
         *
         * @name   TopNav.collapseBar
         * @function
         */
        me.collapseBar = function()
        {
            const navbar = document.getElementById('navbar');
            if (navbar && navbar.getAttribute('aria-expanded') === 'true') {
                const navbarToggle = document.querySelector('.navbar-toggle');
                if (navbarToggle) {
                    // For Bootstrap 5, use the Collapse API if simple click doesn't work
                    // This assumes Bootstrap's JS is loaded and the toggle is set up correctly.
                    // A more robust way might involve:
                    // const collapseInstance = bootstrap.Collapse.getInstance(navbar);
                    // if (collapseInstance) collapseInstance.hide();
                    // else new bootstrap.Collapse(navbar).hide();
                    // For now, direct click:
                    navbarToggle.click();
                }
            }
        };

        /**
         * Reset the top navigation back to it's default values.
         *
         * @name   TopNav.resetInput
         * @function
         */
        me.resetInput = function()
        {
            clearAttachmentInput();
            clearPasswordInput();
            if (burnAfterReadingCheckbox) burnAfterReadingCheckbox.checked = burnAfterReadingDefault;
            if (openDiscussionCheckbox) openDiscussionCheckbox.checked = openDiscussionDefault;
            if (openDiscussionOptionElement && (openDiscussionDefault || !burnAfterReadingDefault)) openDiscussionOptionElement.classList.remove('buttondisabled');
            if (burnAfterReadingOptionElement && (burnAfterReadingDefault || !openDiscussionDefault)) burnAfterReadingOptionElement.classList.remove('buttondisabled');

            pasteExpiration = Model.getExpirationDefault() || pasteExpiration;
            const pasteExpirationDisplay = document.getElementById('pasteExpirationDisplay');
            document.querySelectorAll('#pasteExpiration > option').forEach(option => {
                if (option.value === pasteExpiration && pasteExpirationDisplay) {
                    pasteExpirationDisplay.textContent = option.textContent;
                }
            });
        };

        /**
         * returns the currently set expiration time
         *
         * @name   TopNav.getExpiration
         * @function
         * @return {int}
         */
        me.getExpiration = function()
        {
            return pasteExpiration;
        };

        /**
         * returns the currently selected file(s)
         *
         * @name   TopNav.getFileList
         * @function
         * @return {FileList|null}
         */
        me.getFileList = function()
        {
            const fileInput = document.getElementById('file');
            if (!fileInput || !fileInput.files || !fileInput.files.length) {
                return null;
            }
            if (!(fileInput.files && fileInput.files[0])) { // Ensure file is accessible
                return null;
            }
            return fileInput.files;
        };

        /**
         * returns the state of the burn after reading checkbox
         *
         * @name   TopNav.getBurnAfterReading
         * @function
         * @return {bool}
         */
        me.getBurnAfterReading = function()
        {
            return burnAfterReadingCheckbox ? burnAfterReadingCheckbox.checked : false;
        };

        /**
         * returns the state of the discussion checkbox
         *
         * @name   TopNav.getOpenDiscussion
         * @function
         * @return {bool}
         */
        me.getOpenDiscussion = function()
        {
            return openDiscussionCheckbox ? openDiscussionCheckbox.checked : false;
        };

        /**
         * returns the entered password
         *
         * @name   TopNav.getPassword
         * @function
         * @return {string}
         */
        me.getPassword = function()
        {
            return passwordInputElement ? passwordInputElement.value || '' : '';
        };

        /**
         * returns the element where custom attachments can be placed
         *
         * Used by AttachmentViewer when an attachment is cloned here.
         *
         * @name   TopNav.getCustomAttachment
         * @function
         * @return {Element}
         */
        me.getCustomAttachment = function()
        {
            return customAttachmentElement;
        };

        /**
         * Set a function to call when the retry button is clicked.
         *
         * @name   TopNav.setRetryCallback
         * @function
         * @param {function} callback
         */
        me.setRetryCallback = function(callback)
        {
            retryButtonCallback = callback;
        }

        /**
         * Highlight file upload
         *
         * @name  TopNav.highlightFileupload
         * @function
         */
        me.highlightFileupload = function()
        {
            if (attachElement && fileWrapElement) {
                const attachDropdownToggle = attachElement.querySelector('.dropdown-toggle');
                if (attachDropdownToggle && attachDropdownToggle.getAttribute('aria-expanded') === 'false') {
                    // For Bootstrap 5 dropdowns, a click might be enough, or use API:
                    // const dropdownInstance = bootstrap.Dropdown.getInstance(attachDropdownToggle) || new bootstrap.Dropdown(attachDropdownToggle);
                    // dropdownInstance.show();
                    attachDropdownToggle.click();
                }
                fileWrapElement.classList.add('highlight');
                setTimeout(function () {
                    fileWrapElement.classList.remove('highlight');
                }, 300);
            }
        }

        /**
         * set the format on bootstrap templates in dropdown programmatically
         *
         * @name    TopNav.setFormat
         * @function
         */
        me.setFormat = function(format)
        {
            if (formatterElement && formatterElement.parentElement) {
                const formatLink = formatterElement.parentElement.querySelector(`a[data-format="${format}"]`);
                if (formatLink) formatLink.click();
            }
        }

        /**
         * returns if attachment dropdown is readonly, not editable
         *
         * @name   TopNav.isAttachmentReadonly
         * @function
         * @return {bool}
         */
        me.isAttachmentReadonly = function()
        {
            return !createButtonsDisplayed || (attachElement && attachElement.classList.contains('hidden'));
        }

        /**
         * init navigation manager
         *
         * preloads jQuery elements
         *
         * @name   TopNav.init
         * @function
         */
        me.init = function()
        {
            attachElement = document.getElementById('attach');
            burnAfterReadingCheckbox = document.getElementById('burnafterreading');
            burnAfterReadingOptionElement = document.getElementById('burnafterreadingoption');
            cloneButtonElement = document.getElementById('clonebutton');
            customAttachmentElement = document.getElementById('customattachment');
            expirationElement = document.getElementById('expiration');
            fileRemoveButtonElement = document.getElementById('fileremovebutton');
            fileWrapElement = document.getElementById('filewrap');
            formatterElement = document.getElementById('formatter');
            newButtonElement = document.getElementById('newbutton');
            openDiscussionCheckbox = document.getElementById('opendiscussion');
            openDiscussionOptionElement = document.getElementById('opendiscussionoption');
            passwordContainerElement = document.getElementById('password');
            passwordInputElement = document.getElementById('passwordinput');
            rawTextButtonElement = document.getElementById('rawtextbutton');
            downloadTextButtonElement = document.getElementById('downloadtextbutton');
            retryButtonElement = document.getElementById('retrybutton');
            sendButtonElement = document.getElementById('sendbutton');
            qrCodeLinkElement = document.getElementById('qrcodelink');
            emailLinkElement = document.getElementById('emaillink');

            document.querySelectorAll('#language ul.dropdown-menu li a').forEach(el => el.addEventListener('click', setLanguage));
            const languageSelect = document.querySelector('#language select');
            if (languageSelect) languageSelect.addEventListener('change', setLanguage);

            document.querySelectorAll('#template ul.dropdown-menu li a').forEach(el => el.addEventListener('click', setTemplate));
            const templateSelect = document.querySelector('#template select');
            if (templateSelect) templateSelect.addEventListener('change', setTemplate);

            if (burnAfterReadingCheckbox) burnAfterReadingCheckbox.addEventListener('change', changeBurnAfterReading);
            if (openDiscussionOptionElement) openDiscussionOptionElement.addEventListener('change', changeOpenDiscussion); // Assuming this is the correct element to listen on
            if (newButtonElement) newButtonElement.addEventListener('click', clickNewPaste);
            if (sendButtonElement) sendButtonElement.addEventListener('click', PasteEncrypter.sendPaste);
            if (cloneButtonElement) cloneButtonElement.addEventListener('click', Controller.clonePaste);
            if (rawTextButtonElement) rawTextButtonElement.addEventListener('click', rawText);
            if (downloadTextButtonElement) downloadTextButtonElement.addEventListener('click', downloadText);
            if (retryButtonElement) retryButtonElement.addEventListener('click', clickRetryButton);
            if (fileRemoveButtonElement) fileRemoveButtonElement.addEventListener('click', removeAttachment);
            if (qrCodeLinkElement) qrCodeLinkElement.addEventListener('click', displayQrCode);

            if (expirationElement && expirationElement.parentElement) {
                expirationElement.parentElement.querySelectorAll('ul.dropdown-menu li a').forEach(el => el.addEventListener('click', updateExpiration));
            }
            if (formatterElement && formatterElement.parentElement) {
                formatterElement.parentElement.querySelectorAll('ul.dropdown-menu li a').forEach(el => el.addEventListener('click', updateFormat));
            }

            const pasteExpirationSelect = document.getElementById('pasteExpiration');
            if (pasteExpirationSelect) pasteExpirationSelect.addEventListener('change', function() {
                pasteExpiration = Model.getExpirationDefault();
            });
            const pasteFormatterSelect = document.getElementById('pasteFormatter');
            if (pasteFormatterSelect) pasteFormatterSelect.addEventListener('change', function() {
                PasteViewer.setFormat(Model.getFormatDefault());
            });

            changeBurnAfterReading();
            changeOpenDiscussion();

            burnAfterReadingDefault = me.getBurnAfterReading();
            openDiscussionDefault = me.getOpenDiscussion();
            pasteExpiration = Model.getExpirationDefault();

            createButtonsDisplayed = false;
            viewButtonsDisplayed = false;
        };

        return me;
    })(window, document);

    /**
     * Responsible for AJAX requests, transparently handles encryption…
     *
     * @name   ServerInteraction
     * @class
     */
    const ServerInteraction = (function () {
        const me = {};

        let successFunc = null,
            failureFunc = null,
            symmetricKey = null,
            url,
            data,
            password;

        /**
         * public variable ('constant') for errors to prevent magic numbers
         *
         * @name   ServerInteraction.error
         * @readonly
         * @enum   {Object}
         */
        me.error = {
            okay: 0,
            custom: 1,
            unknown: 2,
            serverError: 3
        };

        /**
         * ajaxHeaders to send in AJAX requests
         *
         * @name   ServerInteraction.ajaxHeaders
         * @private
         * @readonly
         * @enum   {Object}
         */
        const ajaxHeaders = {'X-Requested-With': 'JSONHttpRequest'};

        /**
         * called after successful upload
         *
         * @name   ServerInteraction.success
         * @private
         * @function
         * @param {int} status
         * @param {int} result - optional
         */
        function success(status, result)
        {
            if (successFunc !== null) {
                // add useful data to result
                result.encryptionKey = symmetricKey;
                successFunc(status, result);
            }
        }

        /**
         * called after a upload failure
         *
         * @name   ServerInteraction.fail
         * @private
         * @function
         * @param {int} status - internal code
         * @param {int} result - original error code
         */
        function fail(status, result)
        {
            if (failureFunc !== null) {
                failureFunc(status, result);
            }
        }

        /**
         * actually uploads the data
         *
         * @name   ServerInteraction.run
         * @function
         */
        me.run = function()
        {
            const isPost = Object.keys(data).length > 0;
            const fetchOptions = {
                method: isPost ? 'POST' : 'GET',
                headers: {...ajaxHeaders} // Clone ajaxHeaders
            };

            if (isPost) {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(data);
            }
            // Ensure Accept header is set for JSON response expectation, if not already in ajaxHeaders
            if (!fetchOptions.headers['Accept']) {
                fetchOptions.headers['Accept'] = 'application/json';
            }

            fetch(url, fetchOptions)
                .then(response => {
                    if (!response.ok) {
                        // Try to parse JSON error body, otherwise use statusText
                        return response.json()
                            .catch(() => null) // If JSON parsing fails, errorData will be null
                            .then(errorData => {
                                throw { // Create a custom error object to pass more info
                                    isHttpError: true,
                                    status: response.status,
                                    statusText: response.statusText,
                                    errorData: errorData // This could be the parsed JSON error from server or null
                                };
                            });
                    }
                    return response.json();
                })
                .then(result => {
                    if (result.status === 0) {
                        success(0, result);
                    } else if (result.status === 1) {
                        fail(1, result);
                    } else {
                        // This case might need adjustment based on how non-zero, non-one statuses were handled
                        fail(2, result);
                    }
                })
                .catch(error => {
                    if (error.isHttpError) {
                        console.error('Server error:', error.status, error.statusText, error.errorData);
                        // Adapt to what fail() expects. jqXHR had responseJSON, status, statusText.
                        fail(3, {
                            status: error.status,
                            statusText: error.statusText,
                            responseJSON: error.errorData
                            // Consider adding responseText if the errorData was not JSON parsable but text.
                        });
                    } else { // Network error, CORS, or other JS error before/during fetch
                        console.error('Network or other error:', error);
                        fail(3, { status: 0, statusText: error.message || 'Network error' }); // status 0 for network errors
                    }
                });
        };

        /**
         * return currently set data, used in unit testing
         *
         * @name   ServerInteraction.getData
         * @function
         */
        me.getData = function()
        {
            return data;
        };

        /**
         * set success function
         *
         * @name   ServerInteraction.setUrl
         * @function
         * @param {function} newUrl
         */
        me.setUrl = function(newUrl)
        {
            url = newUrl;
        };

        /**
         * sets the password to use (first value) and optionally also the
         * encryption key (not recommended, it is automatically generated).
         *
         * Note: Call this after prepare() as prepare() resets these values.
         *
         * @name   ServerInteraction.setCryptValues
         * @function
         * @param {string} newPassword
         * @param {string} newKey       - optional
         */
        me.setCryptParameters = function(newPassword, newKey)
        {
            password = newPassword;

            if (typeof newKey !== 'undefined') {
                symmetricKey = newKey;
            }
        };

        /**
         * set success function
         *
         * @name   ServerInteraction.setSuccess
         * @function
         * @param {function} func
         */
        me.setSuccess = function(func)
        {
            successFunc = func;
        };

        /**
         * set failure function
         *
         * @name   ServerInteraction.setFailure
         * @function
         * @param {function} func
         */
        me.setFailure = function(func)
        {
            failureFunc = func;
        };

        /**
         * prepares a new upload
         *
         * Call this when doing a new upload to reset any data from potential
         * previous uploads. Must be called before any other method of this
         * module.
         *
         * @name   ServerInteraction.prepare
         * @function
         * @return {object}
         */
        me.prepare = function()
        {
            // entropy should already be checked!

            // reset password
            password = '';

            // reset key, so it a new one is generated when it is used
            symmetricKey = null;

            // reset data
            successFunc = null;
            failureFunc = null;
            url = Helper.baseUri();
            data = {};
        };

        /**
         * encrypts and sets the data
         *
         * @name   ServerInteraction.setCipherMessage
         * @async
         * @function
         * @param {object} cipherMessage
         */
        me.setCipherMessage = async function(cipherMessage)
        {
            if (
                symmetricKey === null ||
                (typeof symmetricKey === 'string' && symmetricKey === '')
            ) {
                symmetricKey = CryptTool.getSymmetricKey();
            }
            if (!data.hasOwnProperty('adata')) {
                data['adata'] = [];
            }
            let cipherResult = await CryptTool.cipher(symmetricKey, password, JSON.stringify(cipherMessage), data['adata']);
            data['v'] = 2;
            data['ct'] = cipherResult[0];
            data['adata'] = cipherResult[1];

        };

        /**
         * set the additional metadata to send unencrypted
         *
         * @name   ServerInteraction.setUnencryptedData
         * @function
         * @param {string} index
         * @param {mixed} element
         */
        me.setUnencryptedData = function(index, element)
        {
            data[index] = element;
        };

        /**
         * Helper, which parses shows a general error message based on the result of the ServerInteraction
         *
         * @name    ServerInteraction.parseUploadError
         * @function
         * @param {int} status
         * @param {object} data
         * @param {string} doThisThing - a human description of the action, which was tried
         * @return {array}
         */
        me.parseUploadError = function(status, data, doThisThing) {
            let errorArray;

            switch (status) {
                case me.error.custom:
                    errorArray = ['Could not ' + doThisThing + ': %s', data.message];
                    break;
                case me.error.unknown:
                    errorArray = ['Could not ' + doThisThing + ': %s', I18n._('unknown status')];
                    break;
                case me.error.serverError:
                    errorArray = ['Could not ' + doThisThing + ': %s', I18n._('server error or not responding')];
                    break;
                default:
                    errorArray = ['Could not ' + doThisThing + ': %s', I18n._('unknown error')];
                    break;
            }

            return errorArray;
        };

        return me;
    })();

    /**
     * (controller) Responsible for encrypting paste and sending it to server.
     *
     * Does upload, encryption is done transparently by ServerInteraction.
     *
     * @name PasteEncrypter
     * @class
     */
    const PasteEncrypter = (function () {
        const me = {};

        /**
         * called after successful paste upload
         *
         * @name PasteEncrypter.showCreatedPaste
         * @private
         * @function
         * @param {int} status
         * @param {object} data
         */
        function showCreatedPaste(status, data) {
            Alert.hideLoading();
            Alert.hideMessages();

            // show notification
            const baseUri   = Helper.baseUri() + '?',
                  url       = baseUri + data.id + (TopNav.getBurnAfterReading() ? loadConfirmPrefix : '#') + CryptTool.base58encode(data.encryptionKey),
                  deleteUrl = baseUri + 'pasteid=' + data.id + '&deletetoken=' + data.deletetoken;
            PasteStatus.createPasteNotification(url, deleteUrl);

            // show new URL in browser bar
            history.pushState({type: 'newpaste'}, document.title, url);

            TopNav.showViewButtons();

            CopyToClipboard.setUrl(url);
            CopyToClipboard.showKeyboardShortcutHint();

            // this cannot be grouped with showViewButtons due to remaining time calculation
            TopNav.showEmailButton();

            TopNav.hideRawButton();
            TopNav.hideDownloadButton();
            Editor.hide();

            // parse and show text
            // (preparation already done in me.sendPaste())
            PasteViewer.run();
        }

        /**
         * called after successful comment upload
         *
         * @name PasteEncrypter.showUploadedComment
         * @private
         * @function
         * @param {int} status
         * @param {object} data
         */
        function showUploadedComment(status, data) {
            // show success message
            Alert.showStatus('Comment posted.');

            // reload paste
            Controller.refreshPaste(function () {
                // highlight sent comment
                DiscussionViewer.highlightComment(data.id, true);
                // reset error handler
                Alert.setCustomHandler(null);
            });
        }

        /**
         * send a reply in a discussion
         *
         * @name   PasteEncrypter.sendComment
         * @async
         * @function
         */
        me.sendComment = async function()
        {
            Alert.hideMessages();
            Alert.setCustomHandler(DiscussionViewer.handleNotification);

            // UI loading state
            TopNav.hideAllButtons();
            Alert.showLoading('Sending comment…', 'cloud-upload');

            // get data
            const plainText = DiscussionViewer.getReplyMessage(),
                  nickname  = DiscussionViewer.getReplyNickname(),
                  parentid  = DiscussionViewer.getReplyCommentId();

            // do not send if there is no data
            if (plainText.length === 0) {
                // revert loading status…
                Alert.hideLoading();
                Alert.setCustomHandler(null);
                TopNav.showViewButtons();
                return;
            }

            // prepare server interaction
            ServerInteraction.prepare();
            ServerInteraction.setCryptParameters(Prompt.getPassword(), Model.getPasteKey());

            // set success/fail functions
            ServerInteraction.setSuccess(showUploadedComment);
            ServerInteraction.setFailure(function (status, data) {
                // revert loading status…
                Alert.hideLoading();
                TopNav.showViewButtons();

                // …show error message…
                Alert.showError(
                    ServerInteraction.parseUploadError(status, data, 'post comment')
                );

                // …and reset error handler
                Alert.setCustomHandler(null);
            });

            // fill it with unencrypted params
            ServerInteraction.setUnencryptedData('pasteid', Model.getPasteId());
            if (typeof parentid === 'undefined') {
                // if parent id is not set, this is the top-most comment, so use
                // paste id as parent, as the root element of the discussion tree
                ServerInteraction.setUnencryptedData('parentid', Model.getPasteId());
            } else {
                ServerInteraction.setUnencryptedData('parentid', parentid);
            }

            // prepare cypher message
            let cipherMessage = {
                'comment': plainText
            };
            if (nickname.length > 0) {
                cipherMessage['nickname'] = nickname;
            }

            await ServerInteraction.setCipherMessage(cipherMessage).catch(Alert.showError);
            ServerInteraction.run();
        };

        /**
         * sends a new paste to server
         *
         * @name   PasteEncrypter.sendPaste
         * @async
         * @function
         */
        me.sendPaste = async function()
        {
            // hide previous (error) messages
            Controller.hideStatusMessages();

            // UI loading state
            TopNav.hideAllButtons();
            Alert.showLoading('Sending paste…', 'cloud-upload');
            TopNav.collapseBar();

            // get data
            const plainText = Editor.getText(),
                  format    = PasteViewer.getFormat(),
                  // the methods may return different values if no files are attached (null, undefined or false)
                  files     = TopNav.getFileList() || AttachmentViewer.getFiles() || AttachmentViewer.hasAttachment();

            // do not send if there is no data
            if (plainText.length === 0 && !files) {
                // revert loading status…
                Alert.hideLoading();
                TopNav.showCreateButtons();
                return;
            }

            // prepare server interaction
            ServerInteraction.prepare();
            ServerInteraction.setCryptParameters(TopNav.getPassword());

            // set success/fail functions
            ServerInteraction.setSuccess(showCreatedPaste);
            ServerInteraction.setFailure(function (status, data) {
                // revert loading status…
                Alert.hideLoading();
                TopNav.showCreateButtons();

                // show error message
                Alert.showError(
                    ServerInteraction.parseUploadError(status, data, 'create paste')
                );
            });

            // fill it with unencrypted submitted options
            ServerInteraction.setUnencryptedData('adata', [
                null, format,
                TopNav.getOpenDiscussion() ? 1 : 0,
                TopNav.getBurnAfterReading() ? 1 : 0
            ]);
            ServerInteraction.setUnencryptedData('meta', {'expire': TopNav.getExpiration()});

            // prepare PasteViewer for later preview
            PasteViewer.setText(plainText);
            PasteViewer.setFormat(format);

            // prepare cypher message
            let attachmentsData = AttachmentViewer.getAttachmentsData(),
                cipherMessage = {
                    'paste': plainText
                };
            if (attachmentsData.length) {
                cipherMessage['attachment'] = attachmentsData;
                cipherMessage['attachment_name'] = AttachmentViewer.getFiles().map((fileInfo => fileInfo.name));
            } else if (AttachmentViewer.hasAttachment()) {
                // fall back to cloned part
                let attachments = AttachmentViewer.getAttachments();
                cipherMessage['attachment'] = attachments.map(attachment => attachment[0]);
                cipherMessage['attachment_name'] = attachments.map(attachment => attachment[1]);

                cipherMessage['attachment'] = await Promise.all(cipherMessage['attachment'].map(async (attachment) => {
                    // we need to retrieve data from blob if browser already parsed it in memory
                    if (typeof attachment === 'string' && attachment.startsWith('blob:')) {
                        Alert.showStatus(
                            [
                                'Retrieving cloned file \'%s\' from memory...',
                                attachment[1]
                            ],
                            'copy'
                        );
                        try {
                            // const blobData = await $.ajax({
                            //     type: 'GET',
                            //     url: `${attachment}`,
                            //     processData: false,
                            //     timeout: 10000,
                            //     xhrFields: {
                            //         withCredentials: false,
                            //         responseType: 'blob'
                            //     }
                            // });
                            const response = await fetch(attachment); // attachment is a blob URL
                            if (!response.ok) {
                                throw new Error(`HTTP error ${response.status} when fetching blob`);
                            }
                            const blobData = await response.blob();

                            if (blobData instanceof window.Blob) {
                                const fileReading = new Promise(function(resolve, reject) {
                                    const fileReader = new FileReader();
                                    fileReader.onload = function (event) {
                                        resolve(event.target.result);
                                    };
                                    fileReader.onerror = function (error) {
                                        reject(error);
                                    }
                                    fileReader.readAsDataURL(blobData);
                                });

                                return await fileReading;
                            } else {
                                const error = 'Cannot process attachment data.';
                                Alert.showError(error);
                                throw new TypeError(error);
                            }
                        } catch (error) {
                            Alert.showError('Cannot retrieve attachment.');
                            throw error;
                        }
                    }
                }));
            }

            // encrypt message
            await ServerInteraction.setCipherMessage(cipherMessage).catch(Alert.showError);

            // send data
            ServerInteraction.run();
        };

        return me;
    })();

    /**
     * (controller) Responsible for decrypting cipherdata and passing data to view.
     *
     * Only decryption, no download.
     *
     * @name PasteDecrypter
     * @class
     */
    const PasteDecrypter = (function () {
        const me = {};

        /**
         * decrypt data or prompts for password in case of failure
         *
         * @name   PasteDecrypter.decryptOrPromptPassword
         * @private
         * @async
         * @function
         * @param  {string} key
         * @param  {string} password - optional, may be an empty string
         * @param  {string} cipherdata
         * @throws {string}
         * @return {false|string} false, when unsuccessful or string (decrypted data)
         */
        async function decryptOrPromptPassword(key, password, cipherdata)
        {
            // try decryption without password
            const plaindata = await CryptTool.decipher(key, password, cipherdata);

            // if it fails, request password
            if (plaindata.length === 0 && password.length === 0) {
                // show prompt
                Prompt.requestPassword();

                // Thus, we cannot do anything yet, we need to wait for the user
                // input.
                return false;
            }

            // if all tries failed, we can only return an error
            if (plaindata.length === 0) {
                return false;
            }

            return plaindata;
        }

        /**
         * decrypt the actual paste text
         *
         * @name   PasteDecrypter.decryptPaste
         * @private
         * @async
         * @function
         * @param  {Paste} paste - paste data in object form
         * @param  {string} key
         * @param  {string} password
         * @throws {string}
         * @return {Promise}
         */
        async function decryptPaste(paste, key, password)
        {
            let pastePlain = await decryptOrPromptPassword(
                key, password,
                paste.getCipherData()
            );
            if (pastePlain === false) {
                if (password.length === 0) {
                    throw 'waiting on user to provide a password';
                } else {
                    Alert.hideLoading();
                    // reset password, so it can be re-entered
                    Prompt.reset();
                    TopNav.showRetryButton();
                    throw 'Could not decrypt data. Did you enter a wrong password? Retry with the button at the top.';
                }
            }

            if (paste.v > 1) {
                // version 2 paste
                const pasteMessage = JSON.parse(pastePlain);
                if (pasteMessage.hasOwnProperty('attachment') && pasteMessage.hasOwnProperty('attachment_name')) {
                    if (Array.isArray(pasteMessage.attachment) && Array.isArray(pasteMessage.attachment_name)) {
                        pasteMessage.attachment.forEach((attachment, key) => {
                            const attachment_name = pasteMessage.attachment_name[key];
                            AttachmentViewer.setAttachment(attachment, attachment_name);
                        });
                    } else {
                        // Continue to process attachment parameters as strings to ensure backward compatibility
                        AttachmentViewer.setAttachment(pasteMessage.attachment, pasteMessage.attachment_name);
                    }
                    AttachmentViewer.showAttachment();
                }
                pastePlain = pasteMessage.paste;
            } else {
                // version 1 paste
                if (paste.hasOwnProperty('attachment') && paste.hasOwnProperty('attachmentname')) {
                    Promise.all([
                        CryptTool.decipher(key, password, paste.attachment),
                        CryptTool.decipher(key, password, paste.attachmentname)
                    ]).then((attachment) => {
                        AttachmentViewer.setAttachment(attachment[0], attachment[1]);
                        AttachmentViewer.showAttachment();
                    });
                }
            }
            PasteViewer.setFormat(paste.getFormat());
            PasteViewer.setText(pastePlain);
            PasteViewer.run();
        }

        /**
         * decrypts all comments and shows them
         *
         * @name   PasteDecrypter.decryptComments
         * @private
         * @async
         * @function
         * @param  {Paste} paste - paste data in object form
         * @param  {string} key
         * @param  {string} password
         * @return {Promise}
         */
        async function decryptComments(paste, key, password)
        {
            // remove potential previous discussion
            DiscussionViewer.prepareNewDiscussion();

            const commentDecryptionPromises = [];
            // iterate over comments
            for (let i = 0; i < paste.comments.length; ++i) {
                const comment        = new Comment(paste.comments[i]),
                      commentPromise = CryptTool.decipher(key, password, comment.getCipherData());
                paste.comments[i] = comment;
                if (comment.v > 1) {
                    // version 2 comment
                    commentDecryptionPromises.push(
                        commentPromise.then(function (commentJson) {
                            const commentMessage = JSON.parse(commentJson);
                            return [
                                commentMessage.comment  || '',
                                commentMessage.nickname || ''
                            ];
                        })
                    );
                } else {
                    // version 1 comment
                    commentDecryptionPromises.push(
                        Promise.all([
                            commentPromise,
                            paste.comments[i].meta.hasOwnProperty('nickname') ?
                                CryptTool.decipher(key, password, paste.comments[i].meta.nickname) :
                                Promise.resolve('')
                        ])
                    );
                }
            }
            return Promise.all(commentDecryptionPromises).then(function (plaintexts) {
                for (let i = 0; i < paste.comments.length; ++i) {
                    if (plaintexts[i][0].length === 0) {
                        continue;
                    }
                    DiscussionViewer.addComment(
                        paste.comments[i],
                        plaintexts[i][0],
                        plaintexts[i][1]
                    );
                }
            });
        }

        /**
         * show decrypted text in the display area, including discussion (if open)
         *
         * @name   PasteDecrypter.run
         * @function
         * @param  {Paste} [paste] - (optional) object including comments to display (items = array with keys ('data','meta'))
         */
        me.run = function(paste)
        {
            Alert.hideMessages();
            Alert.setCustomHandler(null);
            Alert.showLoading('Decrypting paste…', 'cloud-download');

            if (typeof paste === 'undefined' || paste.type === 'click') {
                // get cipher data and wait until it is available
                Model.getPasteData(me.run);
                return;
            }

            let key = Model.getPasteKey(),
                password = Prompt.getPassword(),
                decryptionPromises = [];

            TopNav.setRetryCallback(function () {
                TopNav.hideRetryButton();
                me.run(paste);
            });

            // decrypt paste & attachments
            decryptionPromises.push(decryptPaste(paste, key, password));

            // if the discussion is opened on this paste, display it
            if (paste.isDiscussionEnabled()) {
                decryptionPromises.push(decryptComments(paste, key, password));
            }

            // shows the remaining time (until) deletion
            PasteStatus.showRemainingTime(paste);

            CopyToClipboard.showKeyboardShortcutHint();

            Promise.all(decryptionPromises)
                .then(() => {
                    Alert.hideLoading();
                    TopNav.showViewButtons();

                    // discourage cloning (it cannot really be prevented)
                    if (paste.isBurnAfterReadingEnabled()) {
                        TopNav.hideBurnAfterReadingButtons();
                    } else {
                        // we have to pass in remaining_time here
                        TopNav.showEmailButton(paste.getTimeToLive());
                    }

                    // only offer adding comments, after paste was successfully decrypted
                    if (paste.isDiscussionEnabled()) {
                        DiscussionViewer.finishDiscussion();
                    }

                })
                .catch((err) => {
                    // wait for the user to type in the password,
                    // then PasteDecrypter.run will be called again
                    Alert.showError(err);
                });
        };

        return me;
    })();

    /**
     *
     * @name CopyToClipboard
     * @class
     */
    const CopyToClipboard = (function () {
        const me = {};

        let copyButtonElement,      // Renamed from copyButton
            copyLinkButtonElement,  // Renamed from copyLinkButton
            copyIconElement,        // Renamed from copyIcon
            successIconElement,     // Renamed from successIcon
            shortcutHintElement,    // Renamed from shortcutHint
            url;

        /**
         * Handle copy to clipboard button click
         *
         * @name CopyToClipboard.handleCopyButtonClick
         * @private
         * @function
         */
        function handleCopyButtonClick() {
            if (copyButtonElement) {
                copyButtonElement.addEventListener('click', function() {
                    const text = PasteViewer.getText();
                    saveToClipboard(text);

                    toggleSuccessIcon();
                    showAlertMessage('Paste copied to clipboard');
                });
            }
        };

        /**
         * Handle copy link to clipboard button click
         *
         * @name CopyToClipboard.handleCopyLinkButtonClick
         * @private
         * @function
         */
        function handleCopyLinkButtonClick() {
            if (copyLinkButtonElement) {
                copyLinkButtonElement.addEventListener('click', function () {
                    if (url) { // Ensure URL is set before trying to copy
                        saveToClipboard(url);
                        showAlertMessage('Link copied to clipboard');
                    } else {
                        showAlertMessage('Error: No URL to copy.'); // Or handle more gracefully
                    }
                });
            }
        }

        /**
         * Handle CTRL+C/CMD+C keyboard shortcut
         *
         * @name CopyToClipboard.handleKeyboardShortcut
         * @private
         * @function
         */
        function handleKeyboardShortcut() {
            document.addEventListener('copy', function () {
                if (!isUserSelectedTextToCopy()) {
                    const text = PasteViewer.getText();
                    saveToClipboard(text);
                    showAlertMessage('Paste copied to clipboard');
                }
            });
        };

        /**
         * Check if user selected some text on the page to copy it
         *
         * @name CopyToClipboard.isUserSelectedTextToCopy
         * @private
         * @function
         * @returns {boolean}
         */
        function isUserSelectedTextToCopy() {
            let text = '';

            if (window.getSelection) {
                text = window.getSelection().toString();
            } else if (document.selection && document.selection.type != 'Control') {
                text = document.selection.createRange().text;
            }

            return text.length > 0;
        };

        /**
         * Save text to the clipboard
         *
         * @name CopyToClipboard.saveToClipboard
         * @private
         * @param {string} text
         * @function
         */
        function saveToClipboard(text) {
            navigator.clipboard.writeText(text);
        };

        /**
         * Show alert message after text copy
         *
         * @name CopyToClipboard.showAlertMessage
         * @private
         * @param {string} message
         * @function
         */
        function showAlertMessage(message) {
            Alert.showStatus(message);
        };

        /**
         * Toogle success icon after copy
         *
         * @name CopyToClipboard.toggleSuccessIcon
         * @private
         * @function
         */
        function toggleSuccessIcon() {
            if (copyIconElement) copyIconElement.style.display = 'none';
            if (successIconElement) successIconElement.style.display = 'block';

            setTimeout(function() {
                if (copyIconElement) copyIconElement.style.display = 'block'; // or 'inline' or other appropriate value
                if (successIconElement) successIconElement.style.display = 'none';
            }, 1000);
        };

        /**
         * Show keyboard shortcut hint
         *
         * @name CopyToClipboard.showKeyboardShortcutHint
         * @function
         */
        me.showKeyboardShortcutHint = function () {
            if (shortcutHintElement) {
                I18n._(
                    shortcutHintElement,
                    'To copy paste press on the copy button or use the clipboard shortcut <kbd>Ctrl</kbd>+<kbd>c</kbd>/<kbd>Cmd</kbd>+<kbd>c</kbd>'
                );
            }
        };

        /**
         * Hide keyboard shortcut hint
         *
         * @name CopyToClipboard.hideKeyboardShortcutHint
         * @function
         */
        me.hideKeyboardShortcutHint = function () {
            if (shortcutHintElement) shortcutHintElement.innerHTML = '';
        };

        /**
         * Set paste url
         *
         * @name CopyToClipboard.setUrl
         * @param {string} newUrl
         * @function
         */
        me.setUrl = function (newUrl) {
            url = newUrl;
        };

        /**
         * Initialize
         *
         * @name CopyToClipboard.init
         * @function
         */
        me.init = function() {
            copyButtonElement = document.getElementById('prettyMessageCopyBtn');
            copyLinkButtonElement = document.getElementById('copyLink');
            copyIconElement = document.getElementById('copyIcon');
            successIconElement = document.getElementById('copySuccessIcon');
            shortcutHintElement = document.getElementById('copyShortcutHintText');

            handleCopyButtonClick();
            handleCopyLinkButtonClick();
            handleKeyboardShortcut();
        };

        return me;
    })();

    /**
     * (controller) main PrivateBin logic
     *
     * @name   Controller
     * @param  {object} window
     * @param  {object} document
     * @class
     */
    const Controller = (function (window, document) {
        const me = {};

        /**
         * hides all status messages no matter which module showed them
         *
         * @name   Controller.hideStatusMessages
         * @function
         */
        me.hideStatusMessages = function()
        {
            PasteStatus.hideMessages();
            Alert.hideMessages();
            CopyToClipboard.hideKeyboardShortcutHint();
        };

        /**
         * creates a new paste
         *
         * @name   Controller.newPaste
         * @function
         */
        me.newPaste = function()
        {
            // Important: This *must not* run Alert.hideMessages() as previous
            // errors from viewing a paste should be shown.
            TopNav.hideAllButtons();
            Alert.showLoading('Preparing new paste…', 'time');

            PasteStatus.hideMessages();
            PasteViewer.hide();
            Editor.resetInput();
            Editor.show();
            Editor.focusInput();
            AttachmentViewer.removeAttachment();
            TopNav.resetInput();

            TopNav.showCreateButtons();

            // newPaste could be called when user is on paste clone editing view
            TopNav.hideCustomAttachment();
            AttachmentViewer.clearDragAndDrop();
            AttachmentViewer.removeAttachmentData();

            Alert.hideLoading();
            // only push new state if we are coming from a different one
            if (Helper.baseUri() != window.location) {
                history.pushState({type: 'create'}, document.title, Helper.baseUri());
            }

            // clear discussion
            DiscussionViewer.prepareNewDiscussion();
        };

        /**
         * shows the loaded paste
         *
         * @name   Controller.showPaste
         * @function
         */
        me.showPaste = function()
        {
            try {
                Model.getPasteKey();
            } catch (err) {
                console.error(err);

                // missing decryption key (or paste ID) in URL?
                if (window.location.hash.length === 0) {
                    Alert.showError('Cannot decrypt paste: Decryption key missing in URL (Did you use a redirector or an URL shortener which strips part of the URL?)');
                    return;
                }
            }

            // check if we should request loading confirmation
            if(window.location.hash.startsWith(loadConfirmPrefix)) {
                Prompt.requestLoadConfirmation();
                return;
            }

            // show proper elements on screen
            PasteDecrypter.run();
        };

        /**
         * refreshes the loaded paste to show potential new data
         *
         * @name   Controller.refreshPaste
         * @function
         * @param  {function} callback
         */
        me.refreshPaste = function(callback)
        {
            // save window position to restore it later
            const orgPosition = window.scrollY;

            Model.getPasteData(function (data) {
                ServerInteraction.prepare();
                ServerInteraction.setUrl(Helper.baseUri() + '?pasteid=' + Model.getPasteId());

                ServerInteraction.setFailure(function (status, data) {
                    // revert loading status…
                    Alert.hideLoading();
                    TopNav.showViewButtons();

                    // show error message
                    Alert.showError(
                        ServerInteraction.parseUploadError(status, data, 'refresh display')
                    );
                });
                ServerInteraction.setSuccess(function (status, data) {
                    PasteDecrypter.run(new Paste(data));

                    // restore position
                    window.scrollTo(0, orgPosition);

                    // NOTE: could create problems as callback may be called
                    // asyncronously if PasteDecrypter e.g. needs to wait for a
                    // password being entered
                    callback();
                });
                ServerInteraction.run();
            }, false); // this false is important as it circumvents the cache
        }

        /**
         * clone the current paste
         *
         * @name   Controller.clonePaste
         * @function
         */
        me.clonePaste = function()
        {
            TopNav.collapseBar();
            TopNav.hideAllButtons();

            // hide messages from previous paste
            me.hideStatusMessages();

            // erase the id and the key in url
            history.pushState({type: 'clone'}, document.title, Helper.baseUri());

            if (AttachmentViewer.hasAttachment()) {
                const attachments = AttachmentViewer.getAttachments();
                attachments.forEach(attachment => {
                    AttachmentViewer.moveAttachmentTo(
                        TopNav.getCustomAttachment(),
                        attachment,
                        'Cloned: \'%s\''
                    );
                });
                TopNav.hideFileSelector();
                AttachmentViewer.hideAttachment();
                // NOTE: it also looks nice without removing the attachment
                // but for a consistent display we remove it…
                AttachmentViewer.hideAttachmentPreview();
                TopNav.showCustomAttachment();

                // show another status messages to make the user aware that the
                // files were cloned too!
                Alert.showStatus(
                    [
                        'The cloned file \'%s\' was attached to this paste.',
                        attachments.map(attachment => attachment[1]).join(', '),
                    ],
                    'copy'
                );
            }

            Editor.setText(PasteViewer.getText());
            // also clone the format
            TopNav.setFormat(PasteViewer.getFormat());
            PasteViewer.hide();
            Editor.show();

            TopNav.showCreateButtons();

            // clear discussion
            DiscussionViewer.prepareNewDiscussion();
        };

        /**
         * try initializing zlib or display a warning if it fails,
         * extracted from main init to allow unit testing
         *
         * @name   Controller.initZ
         * @function
         */
        me.initZ = function()
        {
            z = zlib.catch(function () {
                if (document.body.dataset.compression !== 'none') {
                    Alert.showWarning('Your browser doesn\'t support WebAssembly, used for zlib compression. You can create uncompressed documents, but can\'t read compressed ones.');
                }
            });
        }

        /**
         * application start
         *
         * @name   Controller.init
         * @function
         */
        me.init = function()
        {
            // first load translations
            I18n.loadTranslations();

            // Add a hook to make all links open a new window
            DOMPurify.addHook('afterSanitizeAttributes', function(node) {
                // set all elements owning target to target=_blank
                if ('target' in node && node.id !== 'pasteurl') {
                    node.setAttribute('target', '_blank');
                }
                // set non-HTML/MathML links to xlink:show=new
                if (!node.hasAttribute('target')
                    && (node.hasAttribute('xlink:href')
                        || node.hasAttribute('href'))) {
                    node.setAttribute('xlink:show', 'new');
                }
                if ('rel' in node) {
                    node.setAttribute('rel', 'nofollow noopener noreferrer');
                }
            });

            // initialize other modules/"classes"
            Alert.init();
            Model.init();
            AttachmentViewer.init();
            DiscussionViewer.init();
            Editor.init();
            PasteStatus.init();
            PasteViewer.init();
            Prompt.init();
            TopNav.init();
            UiHelper.init();
            CopyToClipboard.init();

            // TODO: Consider if a more minimal, modern set of feature checks is needed,
            // if any, now that legacy.js is removed. For now, proceeding without.
            // For example, basic Web Crypto API check could be done here if not earlier.
            // if (!window.crypto || !window.crypto.subtle) {
            //     Alert.showError('Web Crypto API is not supported by this browser. This is essential for PrivateBin to work.');
            //     return;
            // }

            me.initZ();

            // if delete token is passed (i.e. paste has been deleted by this
            // access), add an event listener for the 'new' paste button in the alert
            if (Model.hasDeleteToken()) {
                const newFromAlertButton = document.getElementById("new-from-alert");
                if (newFromAlertButton) {
                    newFromAlertButton.addEventListener("click", UiHelper.reloadHome);
                }
                return;
            }

            // check whether existing paste needs to be shown
            try {
                Model.getPasteId();
            } catch (e) {
                // otherwise create a new paste
                return me.newPaste();
            }

            // always reload on back button to invalidate cache(protect burn after read paste)
            window.addEventListener('popstate', () => {
                window.location.reload();
            });

            // display an existing paste
            return me.showPaste();
        }

        return me;
    })(window, document);

    return {
        Helper: Helper,
        I18n: I18n,
        CryptTool: CryptTool,
        Model: Model,
        UiHelper: UiHelper,
        Alert: Alert,
        PasteStatus: PasteStatus,
        Prompt: Prompt,
        Editor: Editor,
        PasteViewer: PasteViewer,
        AttachmentViewer: AttachmentViewer,
        DiscussionViewer: DiscussionViewer,
        TopNav: TopNav,
        ServerInteraction: ServerInteraction,
        PasteEncrypter: PasteEncrypter,
        PasteDecrypter: PasteDecrypter,
        CopyToClipboard: CopyToClipboard,
        Controller: Controller
    };
})(RawDeflate);
