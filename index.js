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
            usage: 'Open local webpack server',
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
      'spa:cleanup': this.cleanup.bind(this),
      'spa:bundle': this.bundle.bind(this),
      'spa:deploy': this.deploy.bind(this),
      'spa:clean:prepare': this.prepare.bind(this),
      'spa:clean:cleanup': this.cleanup.bind(this),
      'spa:bundle:prepare': this.prepare.bind(this),
      'spa:bundle:cleanup': this.cleanup.bind(this),
      'spa:bundle:bundle': this.bundle.bind(this),
      'spa:serve:prepare': this.prepare.bind(this),
      'spa:serve:cleanup': this.cleanup.bind(this),
      'spa:serve:serve': this.serve.bind(this),
      'spa:deploy:prepare': this.prepare.bind(this),
      'spa:deploy:cleanup': this.cleanup.bind(this),
      'spa:deploy:bundle': this.bundle.bind(this),
      'spa:deploy:deploy': this.deploy.bind(this),
      'before:offline:start': this.offline.bind(this),
      'before:offline:start:init': this.offline.bind(this),
    };
  }

  prepare() {
    const Utils = this.serverless.utils;
    const Error = this.serverless.classes.Error;

    this.webpackFileName = _.get(this.serverless, 'service.custom.spa.webpackFileName');

    if(!this.webpackFileName) {
      return Promise.reject(new Error('webpackFileName not defined in custom.spa.'));
    }

    this.appFolder = _.get(this.serverless, 'service.custom.spa.appFolder');

    if(!Utils.dirExistsSync(this.appFolder)) {
      return Promise.reject(new Error('appFolder not defined in custom.spa.'));
    }

    this.distFolder = path.join(process.cwd(), '.spa');
    this.webpackConfigPath = path.join(process.cwd(), this.webpackFileName);

    if(!Utils.fileExistsSync(this.webpackConfigPath)) {
      return Promise.reject(new Error(`Could not find '${this.webpackConfigPath}' file.`));
    }

    process.env.SERVERLESS_STAGE = this.stage;
    this.webpackConfig = require(this.webpackConfigPath);
    this.webpackConfig.output = {
      path: path.join(process.cwd(), '.spa'),
      filename: '[name].js',
      publicPath: '/'
    };

    this.bucketName = _.get(this.serverless, 'service.custom.spa.bucket');
    if(!this.bucketName) {
      this.bucketName = _.get(this.serverless, `service.custom.spa.buckets.${this.stage}`);
    }

    if(!this.bucketName) {
      return Promise.reject(new Error(`Could not find bucket name.`));
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

  appendHmrToEntries(entry, hmrEntries) {
    let result = {};
    if(typeof(entry) === 'string') {
      result = hmrEntries.concat(entry);
    } else if(Array.isArray(entry)) {
      result = hmrEntries.concat(entry);
    } else {
      for(let key in entry) {
        result[key] = this.appendHmrToEntries(entry[key], hmrEntries);
      }
    }

    return result;
  }

  serve() {
    const Error = this.serverless.classes.Error;

    const devServerOptions = _.extend(
      {},
      this.webpackConfig.devServer,
      {
        contentBase: '.spa',
        stats: 'errors-only'
      }
    );
    devServerOptions.port = devServerOptions.port || 8080;

    let url = (devServerOptions.https ? 'https' : 'http');
    url += '://localhost:' + devServerOptions.port + '/';

    if(devServerOptions.hot) {
      const hmrEntries = [
        'webpack-dev-server/client?' + url,
        'webpack/hot/dev-server',
        'react-hot-loader/patch'
      ];

      this.webpackConfig.entry = this.appendHmrToEntries(this.webpackConfig.entry, hmrEntries);


      let hasHmrPlugin = false;
      let hasNameModulesPlugin = false;
      let hasNoEmitErrorsPlugin = false;

      const plugins = this.webpackConfig.plugins;
      const length = plugins.length;
      for(let i = 0; i < length; i++) {
        if(plugins[i].constructor.name === 'HotModuleReplacementPlugin') {
          hasHmrPlugin = true;
          continue;
        }
        if(plugins[i].constructor.name === 'NamedModulesPlugin') {
          hasNameModulesPlugin = true;
          continue;
        }
        if(plugins[i].constructor.name === 'NoEmitOnErrorsPlugin') {
          hasNoEmitErrorsPlugin = true;
          continue;
        }
      }

      if(!hasHmrPlugin) {
        this.webpackConfig.plugins.push(new webpack.HotModuleReplacementPlugin());
      }

      if(!hasNameModulesPlugin) {
        this.webpackConfig.plugins.push(new webpack.NamedModulesPlugin());
      }

      if(!hasNoEmitErrorsPlugin) {
        this.webpackConfig.plugins.push(new webpack.NoEmitOnErrorsPlugin());
      }
    }

    return new BbPromise((resolve, reject) => {
      const compiler = webpack(this.webpackConfig);
      new WebpackDevServer(compiler, devServerOptions)
        .listen(devServerOptions.port, '0.0.0.0', (err) => {
          if(err) {
            reject(err);
          }

          this.serverless.cli.log(`Serving app at ${url}`);
        });
    });
  }

  offline() {
    BbPromise
      .bind(this)
      .then(this.prepare)
      .then(this.cleanup)
      .then(this.serve);
  }

  deploy() {
    function listBuckets(data) {
      data.Buckets.forEach((bucket) => {
        if(bucket.Name === this.bucketName) {
          this.bucketExists = true;
          this.serverless.cli.log(`Bucket ${this.bucketName} already exists`);
        }
      });
    }

    function listObjectsInBucket() {
      if(!this.bucketExists) return BbPromise.resolve();

      this.serverless.cli.log(`Listing objects in bucket ${this.bucketName}...`);

      let params = {
        Bucket: this.bucketName
      };

      return this.aws.request('S3', 'listObjectsV2', params, this.stage, this.region);
    }

    function deleteObjectsFromBucket(data) {
      if(!this.bucketExists) return BbPromise.resolve();

      this.serverless.cli.log(`Deleting all objects from bucket ${this.bucketName}...`);

      if(!data.Contents[0]) {
        return BbPromise.resolve();
      } else {
        let Objects = _.map(data.Contents, (content) => _.pick(content, 'Key'));

        let params = {
          Bucket: this.bucketName,
          Delete: { Objects: Objects }
        };

        return this.aws.request('S3', 'deleteObjects', params, this.stage, this.region);
      }
    }

    function createBucket() {
      if (this.bucketExists) return BbPromise.resolve();
      this.serverless.cli.log(`Creating bucket ${this.bucketName}...`);

      let params = {
        Bucket: this.bucketName
      };

      return this.aws.request('S3', 'createBucket', params, this.stage, this.region)
    }

    function configureBucket() {
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

    function configurePolicyForBucket(){
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

    return this.aws.request('S3', 'listBuckets', {}, this.stage, this.region)
      .bind(this)
      .then(listBuckets)
      .then(listObjectsInBucket)
      .then(deleteObjectsFromBucket)
      .then(createBucket)
      .then(configureBucket)
      .then(configurePolicyForBucket)
      .then(() => this._uploadDirectory(this.distFolder));
  }

  _uploadDirectory(directoryPath) {
    this.serverless.cli.log('Uploading files...');
    let readDirectory = _.partial(fs.readdir, directoryPath);

    async.waterfall([readDirectory, (files) => {
      files = _.map(files, (file) => path.join(directoryPath, file));

      async.each(files, (path) => {
        fs.stat(path, (err, stats) => {
          return stats.isDirectory()
            ? this._uploadDirectory(path)
            : this._uploadFile(path);
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
}

module.exports = SPA;
