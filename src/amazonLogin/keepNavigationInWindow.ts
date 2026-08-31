import type { BrowserWindow, WebContents } from 'electron';

interface NavigationOptions {
  isSuccessUrl: (url: string) => boolean;
  onSuccess: () => void;
  onChildWindow: (window: BrowserWindow) => void;
}

// Obsidian attaches its own navigation handlers to every webContents that the
// app creates, and those handlers hand the URL to the system browser with
// `shell.openExternal`. Amazon's sign-in flow escapes the modal because of
// this. Strip the inherited handlers from the windows that we own, so that the
// whole flow stays inside Obsidian.
export const keepNavigationInWindow = (webContents: WebContents, options: NavigationOptions) => {
  webContents.removeAllListeners('will-navigate');
  webContents.removeAllListeners('will-redirect');
  webContents.removeAllListeners('new-window');

  webContents.setWindowOpenHandler(({ url }) => {
    if (options.isSuccessUrl(url)) {
      options.onSuccess();
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  webContents.on('did-create-window', (childWindow) => {
    options.onChildWindow(childWindow);
    keepNavigationInWindow(childWindow.webContents, options);
  });

  webContents.on('did-navigate', (_event, url) => {
    if (options.isSuccessUrl(url)) {
      options.onSuccess();
    }
  });
};
