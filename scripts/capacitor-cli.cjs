const os = require('node:os');

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'local-user',
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: process.env.ComSpec || 'cmd.exe',
  });
}

require('../node_modules/@capacitor/cli/bin/capacitor');
