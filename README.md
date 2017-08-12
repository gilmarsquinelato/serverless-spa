# Serverless SPA

[![Serverless][ico-serverless]][link-serverless]
[![License][ico-license]][link-license]
[![NPM][ico-npm]][link-npm]
[![Contributors][ico-contributors]][link-contributors]

A Serverless v1.x plugin to deploy your website to AWS S3 using [Webpack][link-webpack] to bundle it.

## Install

```bash
$ npm install serverless-spa --save-dev
```
or
```bash
$ yarn add -D serverless-spa
```

Add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - serverless-spa
```

## Configure

By default the plugin will look for a `webpack.spa.config.js` in root directory.
Alternatively, you can specify a different file in `serverless.yml`:

```yaml
custom:
  spa:
    webpackFileName: "webpack.spa.config.js"
```

The `appFolder` and `bucket` name must be defined. Bucket name can be defined in one parameter,
to be used independent of stage, or be one bucket for each stage.

```yaml
custom:
  spa:
    appFolder: "www"
    bucket: "serverless-site-s3"
```

or

```yaml
custom:
  spa:
    appFolder: "www"
    buckets:
      dev: "dev-serverless-site-s3"
      prod: "prod-serverless-site-s3"
```

## Bundling

This will create a `.spa` folder with generated webpack bundle.
```bash
$ sls spa bundle
```

## Offline

Start a [webpack-dev-server][link-webpack-dev-server] with `devServer` options in webpack config.
```bash
$ sls spa serve
```
or with [serverless-offline][link-serverless-offline]
```yaml
  plugins:
    ...
    - serverless-spa
    ...
    - serverless-offline
    ...
```

```bash
$ sls offline
```

### Hot module replacement
This plugin detects if `devServer.hot` is `true`, and puts the entry points necessary to Hot Module Replacement works, even the [react-hot-loader][link-react-hot-loader] is inserted in each entry point, and detects if webpack config contains the necessary plugins added (HotModuleReplacementPlugin, NamedModulesPlugin, NoEmitOnErrorsPlugin), so you don't need to put configuration related to HMR.

## Deploy

This will create a S3 bucket if not exists, update its configuration to work with SPA (index.html for errors)
```bash
$ sls spa deploy
```

## Note

* The variable `__dirname` have reference to the plugin folder, because [webpack][link-webpack] and [webpack-dev-server][link-webpack-dev-server]
are started programmatically, so replace `__dirname` to `process.cwd()`


[ico-serverless]: http://public.serverless.com/badges/v3.svg
[ico-license]: https://img.shields.io/github/license/gilmarsquinelato/serverless-spa.svg
[ico-npm]: https://img.shields.io/npm/v/serverless-spa.svg
[ico-contributors]: https://img.shields.io/github/contributors/gilmarsquinelato/serverless-spa.svg

[link-serverless]: http://www.serverless.com/
[link-license]: ./blob/master/LICENSE
[link-npm]: https://www.npmjs.com/package/serverless-spa
[link-contributors]: https://github.com/elastic-coders/serverless-spa/graphs/contributors

[link-webpack]: https://webpack.github.io/
[link-babel]: https://babeljs.io/
[link-serverless-offline]: https://www.npmjs.com/package/serverless-offline
[link-webpack-dev-server]: https://www.npmjs.com/package/webpack-dev-server
[link-react-hot-loader]: https://www.npmjs.com/package/react-hot-loader
