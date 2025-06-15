# Running All Unit Tests

Since it is non-trivial to setup all dependencies for our unit testing suite,
we provide a docker image that bundles all of them into one container, both
phpunit for PHP and mocha for JS.

You can fetch and run the image from the docker hub like this:

```console
docker run --rm --read-only -v ~/PrivateBin:/srv:ro privatebin/unit-testing
```

The parameters in detail:

- `-v ~/PrivateBin:/srv:ro` - Replace `~/PrivateBin` with the location of
  the checked out PrivateBin repository on your machine. It is recommended to
  mount it read-only, which guarantees that your repository isn't damaged by
  an accidentally destructive test case in it.
- `--read-only` - This image supports running in read-only mode. Only /tmp
  may be written into.
- `-rm` - Remove the container after the run. This saves you doing a cleanup
  on your docker environment, if you run the image frequently.

You can also run just the php and javascript test suites instead of both:

```console
docker run --rm --read-only -v ~/PrivateBin:/srv:ro privatebin/unit-testing phpunit
docker run --rm --read-only -v ~/PrivateBin:/srv:ro privatebin/unit-testing mocha
```

## Running PHP Unit Tests

In order to run these tests, you will need to install the following packages
and their dependencies:
* A PHP 8.2+ environment.
* `composer` to install PHP dependencies.
* PHP extensions: `php-gd` (for image functions used in some tests/features), `php-sqlite3` (for database tests using SQLite), `php-xdebug` (for code coverage reports).

Example for Debian and Ubuntu (ensure you have PHP 8.2+ from appropriate repositories):
```console
$ sudo apt install php8.2-cli php8.2-gd php8.2-sqlite3 php8.2-xdebug composer
```

Install PHPUnit and other development dependencies using Composer from the root of the PrivateBin checkout:
```console
$ composer install
```
This will install PHPUnit 10 or 11, as per `composer.json`.

Because some unit tests cover optional storage backends, you might need to install their SDKs if you intend to run those specific tests or if they are part of the default suite:
```console
composer require --dev google/cloud-storage aws/aws-sdk-php
```
(Note: `--dev` ensures these are not installed in production if you separate dev/prod dependencies).

To run the tests, change into the `tst` directory and run phpunit (which should be available via `./vendor/bin/phpunit` if not globally installed):
```console
$ cd PrivateBin/tst
$ ../vendor/bin/phpunit
```
Or, from the project root:
```console
$ ./vendor/bin/phpunit -c tst/phpunit.xml
```

Additionally there is the `ConfigurationTestGenerator`. Based on the
configurations defined in its constructor, it generates the unit test file
`tst/ConfigurationCombinationsTest.php`. Due to changes in default SRI hashes
and JavaScript library configurations in `lib/Configuration.php`, the output of
this generator will change. If `ConfigurationCombinationsTest.php` is committed
to the repository, it will need to be regenerated and updated.
Here is how to generate the configuration test and run it:
```console
$ cd PrivateBin/tst
$ ../bin/configuration-test-generator
$ ../vendor/bin/phpunit ConfigurationCombinationsTest.php
```

## Running JavaScript Unit Tests

In order to run these tests, you will need to install the following packages
and its dependencies:
* npm

Then you can use the node package manager to install the latest stable release
of mocha and nyc (for code coverage reports) globally and jsVerify, jsdom
and jsdom-global locally:

```console
$ npm install -g mocha nyc
$ cd PrivateBin/js
$ npm install
```

Example for Debian and Ubuntu, including steps to allow the current user to
install node modules globally:
```console
$ sudo apt install npm
$ sudo mkdir /usr/local/lib/node_modules
$ sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
$ ln -s /usr/bin/nodejs /usr/local/bin/node
$ npm install -g mocha nyc
$ cd PrivateBin/js
$ npm install
```

To run the tests, just change into the `js` directory and run nyc (will produce
coverage report) or just mocha:

```console
$ cd PrivateBin/js
$ nyc mocha
```

### Property Based Unit Testing

In the JavaScript unit tests we use the JSVerify library to leverage property
based unit testing. Instead of artificially creating specific test cases to
cover all relevant paths of the tested code (with the generated coverage reports
providing means to check the tested paths), property based testing allows us to
describe the patterns of data that are valid input.

With each run of the tests, for each `jsc.property` 100 random inputs are
generated and tested. For example we tell the test to generate random strings,
which will include empty strings, numeric strings, long strings, unicode
sequences, etc. This is great for finding corner cases that one might not think
of when explicitly writing one test case at a time.

There is another benefit, too: When an error is found, JSVerify will try to find
the smallest, still failing test case for you and print this out including the
associated random number generator (RNG) state, so you can reproduce it easily:

```console
[...]

  30 passing (3s)
  1 failing

  1) Helper getCookie returns the requested cookie:
     Error: Failed after 30 tests and 11 shrinks. rngState: 88caf85079d32e416b; Counterexample: ["{", "9", "9", "YD8%fT"]; [" ", "_|K:"];

[...]
```

Of course it may just be that you need to adjust a test case if the random
pattern generated is ambiguous. In the above example the cookie string would
contain two identical keys "9", something that may not be valid, but that our
code could encounter and needs to be able to handle.

After you adjusted the code of the library or the test you can rerun the test
with the same RNG state as follows:

```console
$ nyc mocha test --jsverifyRngState 88caf85079d32e416b
```
