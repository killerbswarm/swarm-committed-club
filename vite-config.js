function writeVersionPlugin() {
  const write = () => {
    mkdirSync('public', { recursive: true })
    writeFileSync('public/version.json', JSON.stringify({ version: APP_VERSION }, null, 2))
  }
  return {
    name: 'write-version',
    buildStart: write,
    configureServer: write,
  }
}