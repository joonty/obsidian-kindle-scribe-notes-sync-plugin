import { remote } from 'electron';
import type { BrowserWindow } from 'electron';
import { keepNavigationInWindow } from './keepNavigationInWindow';

const { BrowserWindow: RemoteBrowserWindow } = remote;

export const amazonLogoutModal = () => {
  const modal = new RemoteBrowserWindow({
    width: 450,
    height: 730,
    show: false,
  });

  // We can only change title after page is loaded since HTML page has its own title
  modal.once('ready-to-show', () => {
    modal.setTitle('Logging out');
    modal.show();
  });

  return new Promise((resolve) => {
    const childWindows: BrowserWindow[] = [];
    let settled = false;

    // Amazon sends the user to the sign-in page once the sign-out completes
    const finish = (loggedOut: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(loggedOut);
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
      isSuccessUrl: url => url.startsWith('https://www.amazon.com/ap/signin'),
      onSuccess: () => finish(true),
      onChildWindow: childWindow => childWindows.push(childWindow),
    });

    try {
      void modal.loadURL('https://www.amazon.com/gp/flex/sign-out.html');
    } catch {
      // Swallow error. `loadUrl` is interrupted on successful
      // logout as we immediately redirect to the sign-in page
    }
  });
};
