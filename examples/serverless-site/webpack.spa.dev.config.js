const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const stage = process.env.SERVERLESS_STAGE;

let options = {
  entry: {
    app: [
      './www/scripts/index.js'
    ]
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader'],
        exclude: /node_modules/,
      },
      {
        test: /\.scss$/,
        use: [
          'style-loader',
          'css-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.(jpe?g|png|gif|svg)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              query: {
                hash: 'sha512',
                digest: 'hex',
                name: '[hash].[ext]'
              }
            }
          },
          {
            loader: 'image-webpack-loader',
            options: {
              query: {
                bypassOnDebug: true,
                mozjpeg: {
                  progressive: true,
                },
                gifsicle: {
                  interlaced: true,
                },
                optipng: {
                  optimizationLevel: 7,
                }
              }
            }
          }
        ]
      }
    ]
  },
  devServer: {
    hot: true,
    historyApiFallback: true
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Serverless SPA',
      favicon: './www/favicon.ico',
      template: './www/index.ejs'
    }),
  ],
  resolve: {
    modules: ['node_modules', path.join(process.cwd(), 'www')]
  }
};



module.exports = options;
