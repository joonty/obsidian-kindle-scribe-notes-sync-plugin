import { remote, shell } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';

const { BrowserWindow: RemoteBrowserWindow } = remote;

interface NavigationOptions {
  isSuccessUrl: (url: string) => boolean;
  onSuccess: () => void;
  onChildWindow: (window: BrowserWindow) => void;
}

const isAmazonUrl = (url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // A popup starts on `about:blank` before its opener navigates it, and only
  // http(s) renders a remote page. Both are safe to keep in the window.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }
  return /(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/.test(parsed.hostname);
};

// Our windows have no address bar and no back button, so a page outside the
// sign-in flow strands the user. Send the URL to the system browser and put the
// window back where it was.
const leaveFlow = (webContents: WebContents, url: string) => {
  void shell.openExternal(url);
  // Electron 30 moved `canGoBack`/`goBack` onto `navigationHistory`.
  const history: Pick<WebContents, 'canGoBack' | 'goBack'> =
    (webContents as unknown as { navigationHistory?: Pick<WebContents, 'canGoBack' | 'goBack'> }).navigationHistory ?? webContents;
  if (history.canGoBack()) {
    history.goBack();
    return;
  }
  const window = RemoteBrowserWindow.fromWebContents(webContents);
  if (window && !window.isDestroyed()) {
    window.close();
  }
};

// Obsidian attaches its own navigation handlers to every webContents that the
// app creates, and those handlers hand the URL to the system browser with
// `shell.openExternal`. Amazon's sign-in flow escapes the modal because of
// this. Strip the inherited handlers from the windows that we own, so that the
// whole flow stays inside Obsidian.
//
// Everything below has to survive `electron.remote`. Our listeners live in the
// renderer, and the main process calls them asynchronously and discards what
// they return. A `setWindowOpenHandler` response and `event.preventDefault()`
// therefore never reach the main process in time, so this file observes
// navigation after the fact instead of vetoing it.
export const keepNavigationInWindow = (webContents: WebContents, options: NavigationOptions) => {
  webContents.removeAllListeners('will-navigate');
  webContents.removeAllListeners('will-redirect');
  webContents.removeAllListeners('new-window');

  // A null handler restores the Electron default, which opens the popup in a
  // window of our own. A handler function cannot do that: the main process
  // reads its return value synchronously, a remote callback always returns
  // undefined, and Electron reads that as "deny".
  try {
    (webContents.setWindowOpenHandler as unknown as (handler: null) => void)(null);
  } catch {
    // An Electron build that rejects a null handler keeps the inherited one,
    // and popups keep opening in the system browser.
  }

  webContents.on('did-create-window', (childWindow, details) => {
    if (!isAmazonUrl(details.url)) {
      void shell.openExternal(details.url);
      childWindow.close();
      return;
    }
    options.onChildWindow(childWindow);
    keepNavigationInWindow(childWindow.webContents, options);
  });

  webContents.on('did-navigate', (_event, url) => {
    if (options.isSuccessUrl(url)) {
      options.onSuccess();
      return;
    }
    if (!isAmazonUrl(url)) {
      leaveFlow(webContents, url);
    }
  });
};
