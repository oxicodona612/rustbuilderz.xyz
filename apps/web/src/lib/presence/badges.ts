/**
 * Profile badges that bots can see, from the user's public flags. Discord does
 * not expose Nitro or boost badges to bots, so those cannot appear here.
 */
interface Badge {
  flag: number;
  name: string;
  /** Icon hash on Discord's CDN, under /badge-icons/. */
  icon: string;
}

const BADGES: Badge[] = [
  { flag: 1 << 0, name: 'Discord Staff', icon: '5e74e9b61934fc1f67c65515d1f7e60d' },
  { flag: 1 << 1, name: 'Partnered Server Owner', icon: '3f9748e53446a137a052f3454e2de41e' },
  { flag: 1 << 18, name: 'Moderator Programs Alumni', icon: 'fee1624003e2fee35cb398e125dc479b' },
  { flag: 1 << 2, name: 'HypeSquad Events', icon: 'bf01d1073931f921909045f3a39fd264' },
  { flag: 1 << 6, name: 'HypeSquad Bravery', icon: '8a88d63823d8a71cd5e390baa45efa02' },
  { flag: 1 << 7, name: 'HypeSquad Brilliance', icon: '011940fd013da3f7fb926e4a1cd2e618' },
  { flag: 1 << 8, name: 'HypeSquad Balance', icon: '3aa41de486fa12454c3761e8e223442e' },
  { flag: 1 << 3, name: 'Discord Bug Hunter', icon: '2717692c7dca7289b35297368a940dd0' },
  { flag: 1 << 14, name: 'Discord Bug Hunter', icon: '848f79194d4be5ff5f81505cbd0ce1e6' },
  { flag: 1 << 22, name: 'Active Developer', icon: '6bdc42827a38498929a4920da12695d9' },
  { flag: 1 << 17, name: 'Early Verified Bot Developer', icon: '6df5892e0f35b051f8b61eace34f4967' },
  { flag: 1 << 9, name: 'Early Supporter', icon: '7060786766c9c840eb3019e725d2b358' },
];

export function badgesFor(publicFlags: number): { name: string; url: string }[] {
  return BADGES.filter(({ flag }) => (publicFlags & flag) !== 0).map(({ name, icon }) => ({
    name,
    url: `https://cdn.discordapp.com/badge-icons/${icon}.png`,
  }));
}
