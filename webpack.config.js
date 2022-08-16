const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  entry: {
    index: './src/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
        include: /src/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.less$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader
          },
          {
            loader: "typings-for-css-modules-loader",
            query: {
              modules: true,
              namedExport: true,
              localIdentName: "[name]_[local]_[hash:base64:5]"
            }
          },
          // {
          //   loader: "css-loader",
          // },
          {
            loader: "less-loader",
            options: {
              lessOptions: {
                strictMath: true,
              },
            }
          }
        ]
      }
    ],
  },
  resolve: {
    extensions: [ '.ts', '.tsx', '.js', '.less' ]
  },
  devServer: {
    // public: 'mindslide.cn',
  },
  plugins: [
    new webpack.LoaderOptionsPlugin({
      options: {
        disableHostCheck: true,
      }
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'production'),
        APP_ENV: JSON.stringify('browser')
      },
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css',
    }),
    new HtmlWebpackPlugin({
      filename: './index.html',
      chunks: ['index'],
      template: './index.html',
    }),
    // new BundleAnalyzerPlugin()
  ],
};
