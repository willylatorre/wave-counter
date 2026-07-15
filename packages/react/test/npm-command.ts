interface NpmCommand {
  command: string
  args: string[]
}

export function npmCommandFor(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
): NpmCommand {
  const npmExecPath = env.npm_execpath

  if (platform === 'win32' && npmExecPath?.endsWith('.js')) {
    return {
      command: process.execPath,
      args: [npmExecPath],
    }
  }

  return {
    command: platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [],
  }
}
