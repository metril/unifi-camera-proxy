/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Configuration',
      items: [
        'configuration/web-ui',
        'configuration/common',
        'configuration/rtsp',
        'configuration/frigate',
        'configuration/hikvision',
        'configuration/dahua',
        'configuration/reolink',
        'configuration/reolink_nvr',
        'configuration/amcrest',
        'configuration/tapo',
      ],
    },
  ],
};

module.exports = sidebars;
