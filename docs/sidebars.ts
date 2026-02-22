import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api-reference/three-dom-component',
        'api-reference/queries',
        'api-reference/interactions',
        'api-reference/assertions',
        'api-reference/waiters',
        'api-reference/snapshots',
        'api-reference/diagnostics',
      ],
    },
    {
      type: 'category',
      label: 'DevTools Extension',
      items: [
        'devtools/installation',
        'devtools/usage',
      ],
    },
    'troubleshooting',
  ],
};

export default sidebars;
