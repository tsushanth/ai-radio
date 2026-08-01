fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios build_and_submit

```sh
[bundle exec] fastlane ios build_and_submit
```

Build and submit to App Store for review

### ios upload_previews

```sh
[bundle exec] fastlane ios upload_previews
```

Upload screenshots + app previews from screenshots_final/ to App Store Connect

### ios push_v17_0_10

```sh
[bundle exec] fastlane ios push_v17_0_10
```

Push hi+it screenshots + updated keywords for fr/it/pt/ko/zh/hi to v17.0.10

### ios submit_for_review

```sh
[bundle exec] fastlane ios submit_for_review
```



----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
