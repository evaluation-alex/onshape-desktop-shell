import { app, BrowserWindow as BrowserWindowElectron } from "electron"
import BrowserWindow = GitHubElectron.BrowserWindow
import BrowserWindowOptions = GitHubElectron.BrowserWindowOptions
import { StateManager, WindowItem, DEFAULT_URL } from "./StateManager"
import ApplicationUpdater from "./ApplicationUpdater"

export default class WindowManager {
  private stateManager = new StateManager()
  private windows: Array<BrowserWindow> = []

  constructor() {
    app.on("window-all-closed", () => {
      // restore default set of windows
      this.stateManager.restoreWindows()
      // On OS X it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
      if (process.platform == 'darwin') {
        // reopen initial window
        this.openWindows()
      }
      else {
        app.quit()
      }
    })
  }

  private static saveWindowState(window: BrowserWindow, descriptor: WindowItem): void {
    if (window.isMaximized()) {
      delete descriptor.width
      delete descriptor.height
      delete descriptor.x
      delete descriptor.y
    }
    else {
      const bounds = window.getBounds()
      descriptor.width = bounds.width
      descriptor.height = bounds.height
      descriptor.x = bounds.x
      descriptor.y = bounds.y
    }
  }

  private registerWindowEventHandlers(window: BrowserWindow, descriptor: WindowItem): void {
    window.on("close", (event: WindowEvent) => {
      const window = event.sender
      WindowManager.saveWindowState(window, descriptor)
      const url = window.webContents.getURL()
      if (url != "about:blank") {
        descriptor.url = url
      }
      this.stateManager.save()
    })
    window.on("closed", (event: WindowEvent) => {
      const index = this.windows.indexOf(event.sender)
      console.assert(index >= 0)
      this.windows.splice(index, 1)
    })

    let webContents = window.webContents
    // cannot find way to listen url change in pure JS
    let frameFinishLoadedId: NodeJS.Timer = null
    webContents.on("did-frame-finish-load", (event: any, isMainFrame: boolean) => {
      if (frameFinishLoadedId != null) {
        clearTimeout(frameFinishLoadedId)
        frameFinishLoadedId = null
      }
      frameFinishLoadedId = setTimeout(() => {
        webContents.send("maybeUrlChanged")
      }, 300)
    })
  }

  openWindows(): void {
    let descriptors = this.stateManager.getWindows()
    if (descriptors == null || descriptors.length === 0) {
      this.stateManager.restoreWindows()
      descriptors = this.stateManager.getWindows()
    }

    for (const descriptor of descriptors) {
      if (descriptor.url == "about:blank") {
        // was error on load
        descriptor.url = DEFAULT_URL
      }

      const options: BrowserWindowOptions = {
        // to avoid visible maximizing
        show: false,
        preload: __dirname + "/autoSignIn.js",
        webPreferences: {
          // fix jquery issue (https://github.com/atom/electron/issues/254), and in any case node integration is not required
          nodeIntegration: false,
        }
      }

      let isMaximized = true
      if (descriptor.width != null && descriptor.height != null) {
        options.width = descriptor.width
        options.height = descriptor.height
        isMaximized = false
      }
      if (descriptor.x != null && descriptor.y != null) {
        options.x = descriptor.x
        options.y = descriptor.y
        isMaximized = false
      }

      const window = new BrowserWindowElectron(options)
      if (isMaximized) {
        window.maximize()
      }
      window.loadURL(descriptor.url)
      window.show()
      this.registerWindowEventHandlers(window, descriptor)
      this.windows.push(window)
    }

    new ApplicationUpdater(this.windows[0])
  }

  focusFirstWindow(): void {
    if (this.windows.length > 0) {
      const window = this.windows[0]
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    }
  }
}

interface WindowEvent {
  sender: BrowserWindow
}