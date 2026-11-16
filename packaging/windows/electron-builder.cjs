module.exports = {
  appId: 'com.autoleadpc.windows',
  productName: 'AutoLeadPC',
  directories: { app: 'packaging/windows', output: 'dist/windows' },
  files: ['main.cjs', 'import-bundled-settings.cjs', 'server-control.cjs', 'package.json', '!**/node_modules/**/*'],
  extraFiles: [{ from: 'packaging/windows/server', to: '.', filter: ['**/*'] }],
  extraResources: [
    { from: '.windows-build/backend', to: 'backend', filter: ['**/*'] },
    // electron-builder bỏ node_modules ở gốc mỗi FileSet; chép dependency bằng FileSet riêng.
    { from: '.windows-build/backend/node_modules', to: 'backend/node_modules', filter: ['**/*'] }
  ],
  asar: true,
  npmRebuild: false,
  win: { target: [{ target: 'nsis', arch: ['x64'] }], signAndEditExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, artifactName: 'AutoLeadPC-Setup-${version}-x64.exe' }
};
