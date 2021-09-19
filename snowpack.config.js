// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  alias: {
    $components: './src/components',
    $data: './src/data',
    $layouts: './src/layouts',
    $theme: './src/theme'
  }
};
