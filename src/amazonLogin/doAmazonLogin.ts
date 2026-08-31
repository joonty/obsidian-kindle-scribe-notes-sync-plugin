import { remote } from 'electron';
import type { BrowserWindow } from 'electron';
import { keepNavigationInWindow } from './keepNavigationInWindow';

const { BrowserWindow: RemoteBrowserWindow } = remote;

export const doAmazonLogin = async () => {
  const modal = new RemoteBrowserWindow({
    width: 450,
    height: 730,
    show: false,
  });

  // We can only change title after page is loaded since HTML page has its own title
  modal.once('ready-to-show', () => {
    modal.setTitle('Connect your amazon account to Obsidian');
    modal.show();
  });

  return new Promise((resolve) => {
    const childWindows: BrowserWindow[] = [];
    let settled = false;

    // If user is on the read.amazon.com url, we can safely assume they are logged in
    const finish = (loggedIn: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(loggedIn);
      childWindows.forEach(window => {
        if (!window.isDestroyed()) {
          window.close();
        }
      });
      if (!modal.isDestroyed()) {
        modal.close();
      }
    };

    modal.on('closed', () => finish(false));

    keepNavigationInWindow(modal.webContents, {
      isSuccessUrl: url => url.startsWith('https://read.amazon.com'),
      onSuccess: () => finish(true),
      onChildWindow: childWindow => childWindows.push(childWindow),
    });

    try {
      void modal.loadURL('https://read.amazon.com/notebook');
    } catch {
      // Swallow error. `loadUrl` is interrupted on successful
      // login as we immediately redirect if user is logged in
    }
  });
}
