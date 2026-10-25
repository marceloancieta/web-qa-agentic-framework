# Guide

## Usage

Back to the [readme](../README.md), on to [first steps](other.md#first-steps) and the
[second setup](other.md#setup-1), or [this section](#usage).

A [missing page](missing.md) is reported. <!-- expect-finding: broken-link -->
A [missing anchor](#install) is reported. <!-- expect-finding: broken-link -->
A [wrong anchor elsewhere](other.md#last-steps) is reported. <!-- expect-finding: broken-link -->
A [web page](https://playwright.dev/docs/locators) and [mail](mailto:team@example.test) are not read.
A link in code, `[x](nowhere.md)`, is not read.

```md
[inside a fence](also-nowhere.md)
```

## Wording

The locator advice is copied from the Playwright docs. <!-- expect-finding: public-wording -->
The contrast table was ported from the WCAG quick reference. <!-- expect-finding: public-wording -->
The rule reports phrases such as "copied from" and `carried over`: quoted, they are mentions.
Reporting from the field and supporting tools are fine words.
