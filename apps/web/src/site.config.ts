/**
 * Everything personal about the site lives here. Projects are Markdown files
 * in `src/content/projects`.
 */

export type IconName = 'github' | 'discord' | 'matrix' | 'tiktok';

export interface Social {
  label: string;
  handle: string;
  icon: IconName;
  /** Opens in a new tab when set. */
  href?: string;
  /** Copied to the clipboard when set. */
  copy?: string;
}

const socials: readonly Social[] = [
  {
    label: 'GitHub',
    handle: 'oxicodona612',
    icon: 'github',
    href: 'https://github.com/oxicodona612',
  },
  {
    label: 'Discord',
    handle: '@rustbuilderz',
    icon: 'discord',
    copy: 'rustbuilderz',
  },
  {
    label: 'Matrix',
    handle: '@oxicodona:rustbuilderz.xyz',
    icon: 'matrix',
    href: 'https://matrix.to/#/@oxicodona:rustbuilderz.xyz',
    copy: '@oxicodona:rustbuilderz.xyz',
  },
  {
    label: 'TikTok',
    handle: '@0xycodo',
    icon: 'tiktok',
    href: 'https://www.tiktok.com/@0xycodo',
  },
];

export const site = {
  url: 'https://rustbuilderz.xyz',
  name: 'rustbuilderz',
  title: 'rustbuilderz',
  description:
    'rustbuilderz builds software for chat and the self-hosted web, including Mxcord and a Matrix homeserver.',
  /** Browser UI color and link-preview accent. */
  themeColor: '#000000',

  /** Rotated under the name in the profile card. */
  taglines: [
    'building Mxcord',
    'bridging Matrix into Discord',
    'running my own Matrix homeserver',
    'self-hosting everything I can',
  ],

  about: [
    'I build software for chat and the self-hosted web.',
    'Right now that means Mxcord, which brings Matrix direct messages into Discord, and the Matrix homeserver that lives on this domain.',
  ],

  stack: ['TypeScript', 'JavaScript', 'Matrix', 'Discord', 'Docker', 'Linux', 'Cloudflare'],

  github: {
    username: 'oxicodona612',
    /** Shown until the live Discord avatar loads, and when presence is off. */
    avatar: 'https://avatars.githubusercontent.com/u/248389743?v=4',
  },

  /** This site's own repository, linked in the footer. */
  sourceRepo: 'oxicodona612/rustbuilderz.xyz',

  presence: {
    /** The presence service in `apps/presence`. It speaks the Lanyard protocol. */
    api: 'https://presence.rustbuilderz.xyz',
    /** The Discord account shown on the profile card. Live status is hidden when empty. */
    discordUserId: '1291219455635886083',
  },

  /** Time zone of the local-time tile. */
  clock: {
    timeZone: 'America/Chicago',
  },

  homeserver: {
    /** Server name shown in the about section. */
    name: 'rustbuilderz.xyz',
    /** Where the federation version endpoint is reachable from the browser. */
    baseUrl: 'https://rustbuilderz.xyz',
  },

  socials,
} as const;
