import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'DOAI Proxy',
  description: 'Definitely OpenAI. An OpenAI-compatible API proxy with streaming and function calling.',
  srcDir: 'src',
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],
  themeConfig: {
    nav: [
      { text: 'Guides', link: '/guides/getting-started' },
      { text: 'API Reference', link: '/api/endpoints' },
      { text: 'Examples', link: '/examples/basic-chat' },
      {
        text: 'GitHub',
        link: 'https://github.com/ManningWorks/DOAI-Proxy',
      },
    ],
    sidebar: [
      {
        text: 'Guides',
        items: [
          { text: 'Getting Started', link: '/guides/getting-started' },
          { text: 'Configuration', link: '/guides/configuration' },
          { text: 'Streaming', link: '/guides/streaming' },
          { text: 'Function Calling', link: '/guides/function-calling' },
          { text: 'Authentication', link: '/guides/authentication' },
          { text: 'Summarization', link: '/guides/summarization' },
          { text: 'Adding Providers', link: '/guides/adding-providers' },
          { text: 'Docker Deployment', link: '/guides/docker' },
          { text: 'Production', link: '/guides/production' },
          { text: 'Security', link: '/guides/security' },
          { text: 'Troubleshooting', link: '/guides/troubleshooting' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Endpoints', link: '/api/endpoints' },
          { text: 'Error Codes', link: '/api/error-codes' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Basic Chat', link: '/examples/basic-chat' },
          { text: 'Streaming Response', link: '/examples/streaming' },
          { text: 'Function Calling', link: '/examples/function-calling' },
          { text: 'Client Setup', link: '/examples/client-setup' },
        ],
      },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/ManningWorks/DOAI-Proxy',
      },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message:
        'DOAI Proxy — Definitely OpenAI. (It\'s definitely not.)',
    },
  },
});
