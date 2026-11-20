const { execFile } = require('child_process');

/**
 * Open a URL in the user's default browser without building a shell string.
 * Using execFile with an argument list (not exec with string interpolation)
 * avoids shell injection even if the URL ever contained shell metacharacters.
 */
function openUrl(url) {
  try {
    new URL(url);
  } catch (_error) {
    return;
  }

  let command;
  let args;
  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  execFile(command, args, { shell: false }, () => {}); // best effort — the URL is printed either way
}

module.exports = { openUrl };
