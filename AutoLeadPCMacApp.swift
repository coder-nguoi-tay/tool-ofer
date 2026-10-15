import AppKit
import WebKit
import Security
import LocalAuthentication
import SQLite3

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var nodeProcess: Process?
    private let keychainService = "com.autoleadpc.mac.preferences.v2"
    private let keychainAccount = "launcher-settings"

    /// Creates the main window, starts the local launcher server, and loads its interface.
    /// - Parameter notification: The application launch notification.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let iconURL = Bundle.main.url(forResource: "AutoLeadPC", withExtension: "icns"),
           let applicationIcon = NSImage(contentsOf: iconURL) {
            NSApplication.shared.applicationIconImage = applicationIcon
        }

        let webViewConfiguration = WKWebViewConfiguration()
        webViewConfiguration.userContentController.add(self, name: "autoleadPreferences")
        let webView = WKWebView(frame: .zero, configuration: webViewConfiguration)
        self.webView = webView

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 660),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 560, height: 610)
        window.title = "AutoLeadPC Mac"
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        self.window = window

        do {
            try startLocalServer()
        } catch {
            showError("Không khởi động được ứng dụng. Hãy cài Node.js rồi mở lại.\n\n\(error.localizedDescription)")
            return
        }

        loadInterfaceWhenReady()
    }

    /// Closes the local app after its only window closes.
    /// - Parameter sender: The running macOS application.
    /// - Returns: Whether the app should terminate.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// Stops the Node server when the app exits.
    /// - Parameter notification: The application termination notification.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    func applicationWillTerminate(_ notification: Notification) {
        if let nodeProcess, nodeProcess.isRunning {
            nodeProcess.terminate()
        }
    }

    /// Receives load and save requests from the app interface.
    /// - Parameters:
    ///   - userContentController: The WebKit message controller.
    ///   - message: The settings request sent by the interface.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let request = message.body as? [String: Any], let action = request["action"] as? String else {
            return
        }

        if action == "load" {
            let settings = loadSavedSettings()
            guard let settingsData = try? JSONSerialization.data(withJSONObject: settings) else {
                return
            }
            let encodedSettings = settingsData.base64EncodedString()
            webView?.evaluateJavaScript("window.restoreSavedPreferencesFromBase64('\(encodedSettings)')")
            return
        }

        guard action == "save",
              let settings = request["settings"] as? [String: String],
              let settingsData = try? JSONSerialization.data(withJSONObject: settings) else {
            return
        }
        let saveStatus = saveSettingsToDatabase(settingsData)
        webView?.evaluateJavaScript("window.receivePreferenceSaveResult(\(saveStatus))")
    }

    /// Loads launcher settings and removes the obsolete GoLogin token from saved preferences.
    /// - Returns: Saved settings, or an empty dictionary when no settings are available.
    /// - Author: coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
    /// - Since: 2026-10-15
    private func loadSavedSettings() -> [String: String] {
        if let settingsData = loadSettingsDataFromDatabase(),
           var settings = try? JSONDecoder().decode([String: String].self, from: settingsData) {
            if settings.removeValue(forKey: "apiToken") != nil,
               let sanitizedSettings = try? JSONEncoder().encode(settings) {
                _ = saveSettingsToDatabase(sanitizedSettings)
            }
            return settings
        }

        guard var settings = readSettingsFromKeychain() else { return [:] }
        settings.removeValue(forKey: "apiToken")
        guard let sanitizedSettings = try? JSONEncoder().encode(settings) else { return [:] }
        _ = saveSettingsToDatabase(sanitizedSettings)
        return settings
    }

    /// Reads the current app-specific settings item without allowing Keychain prompts.
    /// - Returns: Decoded settings, or nil if the new app-specific item cannot be read silently.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    private func readSettingsFromKeychain() -> [String: String]? {
        let authenticationContext = LAContext()
        authenticationContext.interactionNotAllowed = true
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: authenticationContext
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let settingsData = result as? Data,
              let settings = try? JSONDecoder().decode([String: String].self, from: settingsData) else {
            return nil
        }
        return settings
    }

    /// Returns the private database location and creates its containing directory.
    /// - Returns: The SQLite database URL, or nil if the application support directory is unavailable.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    private func settingsDatabaseURL() -> URL? {
        guard let supportDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        let applicationDirectory = supportDirectory.appendingPathComponent("AutoLeadPC", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: applicationDirectory, withIntermediateDirectories: true)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: applicationDirectory.path)
        } catch {
            return nil
        }
        return applicationDirectory.appendingPathComponent("preferences.sqlite")
    }

    /// Opens the local settings database and ensures the settings table exists.
    /// - Returns: An open SQLite connection, or nil if the database cannot be prepared.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    private func openSettingsDatabase() -> OpaquePointer? {
        guard let databaseURL = settingsDatabaseURL() else {
            return nil
        }
        var database: OpaquePointer?
        guard sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else {
            if let database { sqlite3_close(database) }
            return nil
        }
        let createTableSQL = "CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings BLOB NOT NULL)"
        guard sqlite3_exec(database, createTableSQL, nil, nil, nil) == SQLITE_OK else {
            sqlite3_close(database)
            return nil
        }
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: databaseURL.path)
        return database
    }

    /// Reads the saved launcher settings blob from SQLite.
    /// - Returns: Encoded settings, or nil if no row exists or the database cannot be read.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    private func loadSettingsDataFromDatabase() -> Data? {
        guard let database = openSettingsDatabase() else { return nil }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "SELECT settings FROM app_settings WHERE id = 1", -1, &statement, nil) == SQLITE_OK,
              let statement else { return nil }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW,
              let bytes = sqlite3_column_blob(statement, 0) else { return nil }
        return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0)))
    }

    /// Saves launcher settings to the per-user SQLite database.
    /// - Parameter settingsData: JSON-encoded launcher settings.
    /// - Returns: Zero on success, otherwise the SQLite error code.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-10
    private func saveSettingsToDatabase(_ settingsData: Data) -> Int32 {
        guard let database = openSettingsDatabase() else { return SQLITE_CANTOPEN }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        let saveSQL = "INSERT INTO app_settings (id, settings) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET settings = excluded.settings"
        guard sqlite3_prepare_v2(database, saveSQL, -1, &statement, nil) == SQLITE_OK,
              let statement else { return sqlite3_errcode(database) }
        defer { sqlite3_finalize(statement) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        let bindStatus = settingsData.withUnsafeBytes { buffer in
            sqlite3_bind_blob(statement, 1, buffer.baseAddress, Int32(settingsData.count), transient)
        }
        guard bindStatus == SQLITE_OK else { return bindStatus }
        return sqlite3_step(statement) == SQLITE_DONE ? 0 : sqlite3_errcode(database)
    }

    /// Starts the bundled launcher server as a child process.
    /// - Throws: An error if Node.js or the bundled launcher files are unavailable.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    private func startLocalServer() throws {
        guard let launcherDirectory = Bundle.main.resourceURL?.appendingPathComponent("launcher", isDirectory: true) else {
            throw NSError(domain: "AutoLeadPCMac", code: 1)
        }

        let nodeCandidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
        guard let nodePath = nodeCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            throw NSError(domain: "AutoLeadPCMac", code: 2, userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy Node.js trong /opt/homebrew/bin hoặc /usr/local/bin."])
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = ["app.mjs"]
        process.currentDirectoryURL = launcherDirectory
        process.environment = ProcessInfo.processInfo.environment.merging(["AUTOLEADPC_NO_OPEN": "1"]) { _, appValue in appValue }
        try process.run()
        nodeProcess = process
    }

    /// Waits for the local server and displays its page in the app window.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    private func loadInterfaceWhenReady() {
        let interfaceURL = URL(string: "http://127.0.0.1:3210")!
        Task { @MainActor in
            for _ in 0..<60 {
                do {
                    let (_, response) = try await URLSession.shared.data(from: interfaceURL)
                    if (response as? HTTPURLResponse)?.statusCode == 200 {
                        webView?.load(URLRequest(url: interfaceURL))
                        return
                    }
                } catch {
                    // The local Node server needs a moment to start.
                }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            showError("Không kết nối được máy chủ giao diện ở cổng 3210.")
        }
    }

    /// Shows a native macOS alert for startup failures.
    /// - Parameter message: The error text to show.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "AutoLeadPC Mac"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}

@main
@MainActor
struct AutoLeadPCMacApp {
    /// Starts the native macOS application lifecycle.
    /// - Author: ductv <ductv@getflycrm.com>
    /// - Since: 2026-10-08
    static func main() {
        let application = NSApplication.shared
        let appDelegate = AppDelegate()
        application.delegate = appDelegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}
