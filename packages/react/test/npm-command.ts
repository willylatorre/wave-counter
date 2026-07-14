export function npmCommandFor(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}
