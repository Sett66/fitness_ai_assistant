require('./load-env');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    require('react-native-css-interop/dist/babel-plugin').default,
    [
      '@babel/plugin-transform-react-jsx',
      {
        runtime: 'automatic',
        importSource: 'react-native-css-interop',
      },
    ],
    [
      'transform-inline-environment-variables',
      {
        include: ['API_BASE_URL', 'STORAGE_PUBLIC_ENDPOINT'],
      },
    ],
  ],
};
