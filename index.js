'use strict';
const path = require('path');
const fse = require('fs-extra');
const BbPromise = require('bluebird');
const _ = require('lodash');
const async = require('async');
const mime = require('mime');
const fs = require('fs');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');


class SPA {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.stage = options.stage || _.get(serverless, 'service.provider.stage')
    this.region = options.region || _.get(serverless, 'service.provider.region');
    this.provider = 'aws';
    this.aws = this.serverless.getProvider(this.provider);

    this.commands = {
      spa: {
        usage: 'Bundle your spa app and deploys to S3',
        lifecycleEvents: [
          'prepare',
          'cleanup',
          'bundle',
          'deploy'
        ],
        options: {
        },
        commands: {
          clean: {
            usage: 'Cleanup deployment folder',
            lifecycleEvents: [
              'prepare',
              'cleanup'
            ],
            options: {
            },
          },
          bundle: {
            usage: 'Bundle app',
            lifecycleEvents: [
              'prepare',
              'cleanup',
              'bundle'
            ],
            options: {
            },
          },
          serve: {
            usage: 'Open local webpack server',
            lifecycleEvents: [
              'prepare',
              'cleanup',
              'serve'
            ],
            options: {
            },
          },
          deploy: {
            usage: 'Deploy app',
            lifecycleEvents: [
              'prepare',
              'cleanup',
              'bundle',
              'deploy'
            ],
            options: {
            },
          },
        }
      },
    };

    this.hooks = {
      'spa:prepare': this.prepare.bind(this),
      'spa:clean:prepare': this.prepare.bind(this),
      'spa:bundle:prepare': this.prepare.bind(this),
      'spa:serve:prepare': this.prepare.bind(this),
      'spa:deploy:prepare': this.prepare.bind(this),

      'spa:cleanup': this.cleanup.bind(this),
      'spa:clean:cleanup': this.cleanup.bind(this),
      'spa:bundle:cleanup': this.cleanup.bind(this),
      'spa:serve:cleanup': this.cleanup.bind(this),
      'spa:deploy:cleanup': this.cleanup.bind(this),

      'spa:bundle': this.bundle.bind(this),
      'spa:bundle:bundle': this.bundle.bind(this),
      'spa:deploy:bundle': this.bundle.bind(this),

      'spa:deploy': this.deploy.bind(this),
      'spa:deploy:deploy': this.deploy.bind(this),

      'spa:serve:serve': this.serve.bind(this),

      'before:offline:start': this.offline.bind(this),
      'before:offline:start:init': this.offline.bind(this),
    };
  }

  prepare() {
    const Utils = this.serverless.utils;
    const Error = this.serverless.classes.Error;

    let error = this._setWebpackFilename();
    if (error) {
      return error;
    }

    error = this._setAppFolder();
    if (error) {
      return error;
    }

    this._setDistFolder();

    error = this._setWebpackConfigPath();
    if (error) {
      return error;
    }

    this._setWebpackConfig();

    error = this._setBucketName();
    if (error) {
      return error;
    }
  }

  cleanup() {
    this.serverless.cli.log('Removing ".spa" folder');
    fse.removeSync(this.distFolder);
  }

  bundle() {
    const Error = this.serverless.classes.Error;
    this.serverless.cli.log('Bundling with Webpack');

    const compiler = webpack(this.webpackConfig);
    return BbPromise
      .fromCallback(cb => compiler.run(cb))
      .then(stats => {

        this.serverless.cli.consoleLog(stats.toString({
          colors: true,
          hash: false,
          version: false,
          chunks: false,
          children: false
        }));
        if (stats.compilation.errors.length) {
          throw new Error('Webpack compilation error, see above');
        }
        const outputPath = stats.compilation.compiler.outputPath;
        this.webpackOutputPath = outputPath;
        this.originalServicePath = this.serverless.config.servicePath;
        this.serverless.config.servicePath = outputPath;
        return stats;
      });
  }

  _appendHmrToEntries(entry, hmrEntries) {
    let result = {};
    if (typeof (entry) === 'string') {
      /*
        entry: 'file.js'
      */
      result = hmrEntries.concat(entry);
    } else if (Array.isArray(entry)) {
      /*
        entry: ['file.js']
      */
      result = hmrEntries.concat(entry);
    } else {
      /*
        entry: {
          app: 'file.js',
          vendor: [
            'f1.js',
            'b.js'
          ]
        }
      */
      for (let key in entry) {
        result[key] = this._appendHmrToEntries(entry[key], hmrEntries);
      }
    }

    return result;
  }

  serve() {
    const Error = this.serverless.classes.Error;

    const devServerOptions = _.extend(
      {
        port: 8080
      },
      this.webpackConfig.devServer,
      {
        contentBase: '.spa',
        stats: 'errors-only'
      }
    );

    const url = this._getDevServerURL(devServerOptions.https, devServerOptions.port);

    this._setHMR(devServerOptions.hot, url);

    return new BbPromise((resolve, reject) => {
      const compiler = webpack(this.webpackConfig);
      new WebpackDevServer(compiler, devServerOptions)
        .listen(devServerOptions.port, '0.0.0.0', (err) => {
          if (err) {
            reject(err);
          }

          this.serverless.cli.log(`Serving app at ${url}`);
        });
    });
  }

  _getDevServerURL(https, port) {
    const protocol = https ? 'https' : 'http';
    return `${protocol}://localhost:${port}/`;
  }

  _setHMR(hmrEnabled, url) {
    if (!hmrEnabled) {
      return;
    }

    const hmrEntries = [
      'webpack-dev-server/client?' + url,
      'webpack/hot/dev-server',
      'react-hot-loader/patch'
    ];

    this.webpackConfig.entry = this._appendHmrToEntries(this.webpackConfig.entry, hmrEntries);

    const plugins = this.webpackConfig.plugins;
    const pluginNames = plugins.map(plugin => plugin.constructor.name);

    if (!_.includes(pluginNames, 'HotModuleReplacementPlugin')) {
      this.webpackConfig.plugins.push(new webpack.HotModuleReplacementPlugin());
    }

    if (!_.includes(pluginNames, 'NamedModulesPlugin')) {
      this.webpackConfig.plugins.push(new webpack.NamedModulesPlugin());
    }

    if (!_.includes(pluginNames, 'NoEmitOnErrorsPlugin')) {
      this.webpackConfig.plugins.push(new webpack.NoEmitOnErrorsPlugin());
    }
  }

  offline() {
    BbPromise
      .bind(this)
      .then(this.prepare)
      .then(this.cleanup)
      .then(this.serve);
  }

  deploy() {
    return this.aws.request('S3', 'listBuckets', {}, this.stage, this.region)
      .bind(this)
      .then(this._listBuckets)
      .then(this._listObjectsInBucket)
      .then(this._deleteObjectsFromBucket)
      .then(this._createBucket)
      .then(this._configureBucket)
      .then(this._configurePolicyForBucket)
      .then(this._uploadDirectory);
  }
  _listBuckets(data) {
    data.Buckets.forEach((bucket) => {
      if (bucket.Name === this.bucketName) {
        this.bucketExists = true;
        this.serverless.cli.log(`Bucket ${this.bucketName} already exists`);
      }
    });
  }

  _listObjectsInBucket() {
    if (!this.bucketExists) return BbPromise.resolve();

    this.serverless.cli.log(`Listing objects in bucket ${this.bucketName}...`);

    let params = {
      Bucket: this.bucketName
    };

    return this.aws.request('S3', 'listObjectsV2', params, this.stage, this.region);
  }

  _deleteObjectsFromBucket(data) {
    if (!this.bucketExists) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log(`Deleting all objects from bucket ${this.bucketName}...`);

    if (!data.Contents[0]) {
      return BbPromise.resolve();
    }

    let Objects = _.map(data.Contents, (content) => _.pick(content, 'Key'));

    let params = {
      Bucket: this.bucketName,
      Delete: { Objects: Objects }
    };

    return this.aws.request('S3', 'deleteObjects', params, this.stage, this.region);
  }

  _createBucket() {
    if (this.bucketExists) return BbPromise.resolve();
    this.serverless.cli.log(`Creating bucket ${this.bucketName}...`);

    let params = {
      Bucket: this.bucketName
    };

    return this.aws.request('S3', 'createBucket', params, this.stage, this.region)
  }

  _configureBucket() {
    this.serverless.cli.log(`Configuring website bucket ${this.bucketName}...`);

    let params = {
      Bucket: this.bucketName,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: { Key: 'index.html' }
      }
    };

    return this.aws.request('S3', 'putBucketWebsite', params, this.stage, this.region)
  }

  _configurePolicyForBucket() {
    this.serverless.cli.log(`Configuring policy for bucket ${this.bucketName}...`);

    let policy = {
      Version: '2008-10-17',
      Id: 'Policy1392681112290',
      Statement: [
        {
          Sid: 'Stmt1392681101677',
          Effect: 'Allow',
          Principal: {
            AWS: '*'
          },
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${this.bucketName}/*`
        }
      ]
    };

    let params = {
      Bucket: this.bucketName,
      Policy: JSON.stringify(policy)
    };

    return this.aws.request('S3', 'putBucketPolicy', params, this.stage, this.region);
  }

  _uploadDirectory() {
    const directoryPath = this.distFolder;
    this.serverless.cli.log('Uploading files...');
    let readDirectory = _.partial(fs.readdir, directoryPath);

    async.waterfall([readDirectory, (files) => {
      files = _.map(files, (file) => path.join(directoryPath, file));

      async.each(files, (path) => {
        fs.stat(path, (err, stats) => {
          return stats.isDirectory() ? this._uploadDirectory(path) : this._uploadFile(path);
        });
      });
    }]);
  }

  _uploadFile(filePath) {
    let fileKey = filePath.replace(this.distFolder, '').substr(1).replace(/\\/g, '/');

    this.serverless.cli.log(`Uploading file ${fileKey} to bucket ${this.bucketName}...`);

    fs.readFile(filePath, (err, fileBuffer) => {
      let params = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: mime.lookup(filePath)
      };

      // TODO: remove browser caching
      return this.aws.request('S3', 'putObject', params, this.stage, this.region);
    });

  }

  _setWebpackFilename() {
    this.webpackFilename = _.get(this.serverless, 'service.custom.spa.webpack');

    if (!this.webpackFilename || typeof (this.webpackFilename) !== 'string') {
      this.webpackFilename = _.get(this.serverless, `service.custom.spa.webpack.${this.stage}`);
    }

    if (!this.webpackFilename) {
      return Promise.reject(new Error('Could not find webpack config.'));
    }
  }

  _setBucketName() {
    this.bucketName = _.get(this.serverless, 'service.custom.spa.bucket');

    if (!this.bucketName || typeof (this.webpackFilename) !== 'string') {
      this.bucketName = _.get(this.serverless, `service.custom.spa.bucket.${this.stage}`);
    }

    if (!this.bucketName) {
      return Promise.reject(new Error(`Could not find bucket name.`));
    }
  }

  _setWebpackConfigPath() {
    this.webpackConfigPath = path.join(process.cwd(), this.webpackFilename);

    if (!Utils.fileExistsSync(this.webpackConfigPath)) {
      return Promise.reject(new Error(`Could not find '${this.webpackConfigPath}' file.`));
    }
  }

  _setWebpackConfig() {
    process.env.SERVERLESS_STAGE = this.stage;
    this.webpackConfig = require(this.webpackConfigPath);

    this.webpackConfig.output = {
      path: path.join(process.cwd(), '.spa'),
      filename: '[name].js',
      publicPath: '/'
    };
  }

  _setAppFolder() {
    this.appFolder = _.get(this.serverless, 'service.custom.spa.appFolder');

    if (!Utils.dirExistsSync(this.appFolder)) {
      return Promise.reject(new Error('appFolder not defined in custom.spa.'));
    }
  }

  _setDistFolder() {
    this.distFolder = path.join(process.cwd(), '.spa');
  }
}

module.exports = SPA;
