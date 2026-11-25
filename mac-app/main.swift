// TC Quoting Estimate - native macOS app. Starts the Next.js server from the app folder and shows it in a window.
//   With Clerk keys in .env:  runs `node scripts/serve.mjs` (normal server, other office devices can connect).
//   Without Clerk keys:       runs a PREVIEW on 127.0.0.1 only with sign-in switched off, so it can be used on
//                             this Mac until sign-in is set up. Nothing else on the network can reach it.
// Built by mac-app/build.sh, which bakes in the app folder and the node path.
import Cocoa
import WebKit

let PORT = 3000
let fm = FileManager.default
let ROOT = URL(fileURLWithPath: Bundle.main.object(forInfoDictionaryKey: "BCBRoot") as? String ?? (NSHomeDirectory() + "/brains-cad-brain"))
let NODE = Bundle.main.object(forInfoDictionaryKey: "BCBNode") as? String ?? "/usr/local/bin/node"
let logURL = ROOT.appendingPathComponent("logs/mac-app.log")
let baseURL = URL(string: "http://127.0.0.1:\(PORT)/")!
let SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"

func clerkConfigured() -> Bool {
    guard let env = try? String(contentsOf: ROOT.appendingPathComponent(".env"), encoding: .utf8) else { return false }
    let lines = env.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
    return lines.contains { $0.hasPrefix("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_") } && lines.contains { $0.hasPrefix("CLERK_SECRET_KEY=sk_") }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var preview = false
    var popups: [NSWindow] = []
    var downloads: [ObjectIdentifier: URL] = [:]

    // MARK: launch
    func applicationDidFinishLaunching(_ note: Notification) {
        try? fm.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.userContentController.add(self, name: "bcb")
        cfg.userContentController.addUserScript(WKUserScript(
            source: "window.print = function(){ window.webkit.messageHandlers.bcb.postMessage({type:'print'}); };",
            injectionTime: .atDocumentStart, forMainFrameOnly: false))
        web = makeWebView(cfg)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "TC Quoting Estimate"
        window.minSize = NSSize(width: 420, height: 500)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("BCBMain")
        window.makeKeyAndOrderFront(nil)
        guard fm.fileExists(atPath: ROOT.appendingPathComponent(".next/BUILD_ID").path) else {
            web.loadHTMLString(statusPage("TC Quoting Estimate isn't built yet", "Expected the app at \(ROOT.path).<br>In Terminal: <code>cd ~/brains-cad-brain && npm run setup</code>"), baseURL: nil)
            return
        }
        web.loadHTMLString(statusPage("Starting TC Quoting Estimate…", ""), baseURL: nil)
        startServer { ok in
            if ok { self.web.load(URLRequest(url: baseURL)); self.dailyBackup() }
            else {
                let tail = (try? String(contentsOf: logURL, encoding: .utf8)).map { String($0.suffix(1500)) } ?? ""
                self.web.loadHTMLString(self.statusPage("TC Quoting Estimate couldn't start", "Port \(PORT) may be used by another program.<pre style='text-align:left;white-space:pre-wrap'>\(tail.replacingOccurrences(of: "<", with: "&lt;"))</pre>"), baseURL: nil)
            }
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ note: Notification) { stopServer() }

    func makeWebView(_ cfg: WKWebViewConfiguration) -> WKWebView {
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.customUserAgent = SAFARI_UA   // Google sign-in refuses embedded web views that don't look like Safari
        w.allowsBackForwardNavigationGestures = true
        w.allowsMagnification = true
        if #available(macOS 13.3, *) { w.isInspectable = true }
        return w
    }

    func statusPage(_ title: String, _ body: String) -> String {
        "<html><head><meta charset=utf-8></head><body style='font-family:-apple-system;background:#292929;color:#eee;display:flex;align-items:center;justify-content:center;height:96vh'><div style='max-width:680px;text-align:center'><h2 style='color:#f0822c'>\(title)</h2><div>\(body)</div></div></body></html>"
    }

    func updateTitle() {
        window.title = preview ? "TC Quoting Estimate — Preview (sign-in off, this Mac only)" : "TC Quoting Estimate"
    }

    // MARK: server
    func ping(_ cb: @escaping (Bool) -> Void) {
        var req = URLRequest(url: baseURL)
        req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async { cb(code > 0 && code < 500) }
        }.resume()
    }

    func startServer(_ done: @escaping (Bool) -> Void) {
        ping { alive in
            if alive { self.preview = !clerkConfigured(); self.updateTitle(); done(true); return }   // already running (auto-start service or npm run serve)
            let p = Process()
            p.executableURL = URL(fileURLWithPath: NODE)
            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "\((NODE as NSString).deletingLastPathComponent):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            env["NEXT_TELEMETRY_DISABLED"] = "1"
            env["PORT"] = String(PORT)
            self.preview = !clerkConfigured()
            if self.preview {
                p.arguments = [ROOT.appendingPathComponent("node_modules/next/dist/bin/next").path, "start", "-H", "127.0.0.1", "-p", String(PORT)]
                env["BCB_AUTH_BYPASS"] = "1"
                env["BCB_ALLOW_TEST_BYPASS"] = "1"
            } else {
                p.arguments = [ROOT.appendingPathComponent("scripts/serve.mjs").path]
                env.removeValue(forKey: "BCB_AUTH_BYPASS")
                env.removeValue(forKey: "BCB_ALLOW_TEST_BYPASS")
            }
            self.updateTitle()
            p.environment = env
            p.currentDirectoryURL = ROOT
            fm.createFile(atPath: logURL.path, contents: nil)
            if let h = try? FileHandle(forWritingTo: logURL) { p.standardOutput = h; p.standardError = h }
            do { try p.run() } catch { done(false); return }
            self.server = p
            var tries = 0
            func poll() {
                self.ping { ok in
                    if ok { done(true) }
                    else if tries > 100 || !p.isRunning { done(false) }
                    else { tries += 1; DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: poll) }
                }
            }
            poll()
        }
    }

    func stopServer() {
        guard let p = server, p.isRunning else { server = nil; return }
        p.terminate()
        p.waitUntilExit()
        server = nil
    }

    func runNodeScript(_ script: String, _ done: ((Int32, String) -> Void)? = nil) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: NODE)
        p.arguments = [ROOT.appendingPathComponent(script).path]
        p.currentDirectoryURL = ROOT
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "\((NODE as NSString).deletingLastPathComponent):/usr/bin:/bin"
        p.environment = env
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = pipe
        p.terminationHandler = { proc in
            let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            DispatchQueue.main.async { done?(proc.terminationStatus, out) }
        }
        try? p.run()
    }

    /// One automatic backup per day (npm run backup), on top of the 2am service backup if that is installed.
    func dailyBackup() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let today = "bcb-\(f.string(from: Date()))"
        let dir = ROOT.appendingPathComponent("backups")
        let have = ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).contains { $0.hasPrefix(today) }
        if !have { runNodeScript("scripts/backup.mjs") }
    }

    // MARK: navigation
    // Main-frame navigations stay in the app (sign-in with Google/Apple redirects through other sites and must
    // come back here with its cookie). Only mail/phone/map style links go to other apps.
    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { decisionHandler(.allow); return }
        if ["http", "https", "about", "data", "blob"].contains(scheme) { decisionHandler(.allow); return }
        NSWorkspace.shared.open(url)   // mailto:, tel:, maps:, etc.
        decisionHandler(.cancel)
    }

    func webView(_ w: WKWebView, decidePolicyFor resp: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = resp.response as? HTTPURLResponse,
           let cd = http.value(forHTTPHeaderField: "Content-Disposition"), cd.lowercased().contains("attachment") {
            decisionHandler(.download); return
        }
        decisionHandler(resp.canShowMIMEType ? .allow : .download)
    }

    func webView(_ w: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ w: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }

    func download(_ d: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dl = fm.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var dest = dl.appendingPathComponent(suggestedFilename)
        let base = dest.deletingPathExtension().lastPathComponent, ext = dest.pathExtension
        var i = 1
        while fm.fileExists(atPath: dest.path) { dest = dl.appendingPathComponent("\(base) \(i).\(ext)"); i += 1 }
        downloads[ObjectIdentifier(d)] = dest
        completionHandler(dest)
    }
    func downloadDidFinish(_ d: WKDownload) {
        if let u = downloads.removeValue(forKey: ObjectIdentifier(d)) { NSWorkspace.shared.activateFileViewerSelecting([u]) }
    }
    func download(_ d: WKDownload, didFailWithError error: Error, resumeData: Data?) { alert("Download failed", error.localizedDescription) }

    func webView(_ w: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        if w == web { w.loadHTMLString(statusPage("Can't reach the TC Quoting Estimate server", "Use Tools → Restart Server."), baseURL: nil) }
    }

    // MARK: pop-up windows (print previews, documents); outside websites open in the default browser
    func webView(_ w: WKWebView, createWebViewWith cfg: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, let host = url.host, host != "127.0.0.1", host != "localhost",
           !host.contains("clerk"), !host.contains("google"), !host.contains("apple.com") {
            NSWorkspace.shared.open(url); return nil
        }
        let child = makeWebView(cfg)
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 1000), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        win.title = "TC Quoting Estimate"
        win.contentView = child
        win.isReleasedWhenClosed = false
        win.center()
        win.makeKeyAndOrderFront(nil)
        popups.append(win)
        NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: win, queue: .main) { [weak self] _ in
            self?.popups.removeAll { $0 === win }
        }
        return child
    }
    func webViewDidClose(_ w: WKWebView) { w.window?.close() }

    // MARK: JS dialogs + file picker
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.runModal(); completionHandler()
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = p; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let tf = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24)); tf.stringValue = defaultText ?? ""
        a.accessoryView = tf; a.window.initialFirstResponder = tf
        completionHandler(a.runModal() == .alertFirstButtonReturn ? tf.stringValue : nil)
    }
    func webView(_ w: WKWebView, runOpenPanelWith params: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel()
        p.allowsMultipleSelection = params.allowsMultipleSelection
        p.canChooseDirectories = false
        p.canChooseFiles = true
        p.begin { r in completionHandler(r == .OK ? p.urls : nil) }
    }

    // MARK: window.print from the page
    func userContentController(_ uc: WKUserContentController, didReceive msg: WKScriptMessage) {
        guard let body = msg.body as? [String: Any], body["type"] as? String == "print", let wv = msg.webView, let win = wv.window else { return }
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.topMargin = 24; info.bottomMargin = 24; info.leftMargin = 24; info.rightMargin = 24
        info.isVerticallyCentered = false
        let op = wv.printOperation(with: info)
        op.view?.frame = wv.bounds
        op.showsPrintPanel = true
        op.showsProgressPanel = true
        op.runModal(for: win, delegate: nil, didRun: nil, contextInfo: nil)
    }

    // MARK: menus
    func buildMenu() {
        let main = NSMenu()
        func item(_ t: String, _ a: Selector?, _ k: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = mods; if let target = target { i.target = target }; return i
        }
        let appM = NSMenu()
        appM.addItem(item("About TC Quoting Estimate", #selector(NSApplication.orderFrontStandardAboutPanel(_:))))
        appM.addItem(.separator())
        appM.addItem(item("Hide TC Quoting Estimate", #selector(NSApplication.hide(_:)), "h"))
        appM.addItem(item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]))
        appM.addItem(.separator())
        appM.addItem(item("Quit TC Quoting Estimate", #selector(NSApplication.terminate(_:)), "q"))
        let editM = NSMenu(title: "Edit")
        editM.addItem(item("Undo", Selector(("undo:")), "z"))
        editM.addItem(item("Redo", Selector(("redo:")), "z", [.command, .shift]))
        editM.addItem(.separator())
        editM.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        editM.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        editM.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        editM.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))
        let viewM = NSMenu(title: "View")
        viewM.addItem(item("Reload", #selector(reload), "r", target: self))
        viewM.addItem(item("Back", #selector(goBack), "[", target: self))
        viewM.addItem(item("Forward", #selector(goForward), "]", target: self))
        viewM.addItem(.separator())
        viewM.addItem(item("Actual Size", #selector(zoomReset), "0", target: self))
        viewM.addItem(item("Zoom In", #selector(zoomIn), "+", target: self))
        viewM.addItem(item("Zoom Out", #selector(zoomOut), "-", target: self))
        viewM.addItem(.separator())
        viewM.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        let goM = NSMenu(title: "Go")
        for (i, (t, path)) in [("Dashboard", "/"), ("Schedule", "/schedule"), ("Orders", "/orders"), ("Reminders", "/reminders"), ("Settings", "/settings")].enumerated() {
            let it = item(t, #selector(goTo(_:)), String(i + 1), target: self); it.representedObject = path; goM.addItem(it)
        }
        let toolsM = NSMenu(title: "Tools")
        toolsM.addItem(item("Address for Other Devices…", #selector(showAddress), "", target: self))
        toolsM.addItem(item("Open in Web Browser", #selector(openInBrowser), "", target: self))
        toolsM.addItem(.separator())
        toolsM.addItem(item("Back Up Now", #selector(backupNow), "", target: self))
        toolsM.addItem(item("Open Backups Folder", #selector(openBackups), "", target: self))
        toolsM.addItem(item("Open App Folder", #selector(openRoot), "", target: self))
        toolsM.addItem(item("Restart Server", #selector(restartServer), "", target: self))
        let winM = NSMenu(title: "Window")
        winM.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        winM.addItem(item("Close", #selector(NSWindow.performClose(_:)), "w"))
        for (title, m) in [("TC Quoting Estimate", appM), ("Edit", editM), ("View", viewM), ("Go", goM), ("Tools", toolsM), ("Window", winM)] {
            let top = NSMenuItem(title: title, action: nil, keyEquivalent: ""); top.submenu = m; main.addItem(top)
        }
        NSApp.mainMenu = main
        NSApp.windowsMenu = winM
    }

    var activeWeb: WKWebView { (NSApp.keyWindow?.contentView as? WKWebView) ?? web }
    @objc func reload() { activeWeb.reload() }
    @objc func goBack() { activeWeb.goBack() }
    @objc func goForward() { activeWeb.goForward() }
    @objc func zoomIn() { activeWeb.pageZoom = min(activeWeb.pageZoom + 0.1, 3) }
    @objc func zoomOut() { activeWeb.pageZoom = max(activeWeb.pageZoom - 0.1, 0.5) }
    @objc func zoomReset() { activeWeb.pageZoom = 1 }
    @objc func goTo(_ s: NSMenuItem) {
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: URL(string: s.representedObject as? String ?? "/", relativeTo: baseURL)!))
    }
    @objc func openInBrowser() { NSWorkspace.shared.open(URL(string: "http://localhost:\(PORT)/")!) }
    @objc func openRoot() { NSWorkspace.shared.open(ROOT) }
    @objc func openBackups() {
        let dir = ROOT.appendingPathComponent("backups"); try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dir)
    }
    @objc func backupNow() {
        runNodeScript("scripts/backup.mjs") { code, out in
            if code == 0 { self.openBackups() }
            else { self.alert("Backup failed", String(out.suffix(800))) }
        }
    }
    @objc func restartServer() {
        stopServer()
        web.loadHTMLString(statusPage("Restarting…", ""), baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            self.startServer { ok in if ok { self.web.load(URLRequest(url: baseURL)) } else { self.alert("Server didn't start", "See \(logURL.path)") } }
        }
    }
    func localHostName() -> String {
        let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/sbin/scutil"); p.arguments = ["--get", "LocalHostName"]
        let pipe = Pipe(); p.standardOutput = pipe; p.standardError = Pipe()
        try? p.run(); p.waitUntilExit()
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "this-mac"
    }
    @objc func showAddress() {
        if preview {
            alert("Only this Mac for now", "Sign-in isn't set up yet, so TC Quoting Estimate is running as a this-Mac-only preview.\n\nAdd the Clerk keys to \(ROOT.path)/.env, run npm run setup, then use Tools → Restart Server. Other devices can then connect.")
            return
        }
        let addr = "http://\(localHostName()).local:\(PORT)"
        let a = NSAlert()
        a.messageText = "Open this on phones and other computers on the office Wi-Fi:"
        a.informativeText = "\(addr)\n\nThis Mac must be awake with TC Quoting Estimate running."
        a.addButton(withTitle: "Copy Address"); a.addButton(withTitle: "Close")
        if a.runModal() == .alertFirstButtonReturn { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(addr, forType: .string) }
    }
    func alert(_ t: String, _ m: String) { let a = NSAlert(); a.messageText = t; a.informativeText = m; a.runModal() }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
