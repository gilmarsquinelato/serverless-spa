const path = require('path');
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals')

module.exports = {
  entry: slsw.lib.entries,
  externals: [nodeExternals()],
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js'
  },
  module: {
    rules: [{
      test: /\.js$/,
      use: ['babel-loader'],
      include: __dirname,
      exclude: /node_modules/,
    }]
  },
};
