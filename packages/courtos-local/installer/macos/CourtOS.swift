// CourtOS menu-bar app. It starts the local server (courtos-local --control) with the
// bundled Node runtime, opens the browser already paired, shows the status, and sets up
// the Word add-in and the localhost certificate. The server ends when this app ends.
//
//   CourtOS            start; open the browser when CourtOS is ready
//   CourtOS --login    start at login (LaunchAgent); no browser
//   CourtOS --check    start, print a one-time link and the status, end (for IT)
//
// The port is 4311, or the "Port" preference (defaults write ch.courtos.local Port 4400),
// or COURTOS_PORT.

import AppKit
import Foundation

enum Paths {
  static let resources = Bundle.main.resourceURL!
  static let node = resources.appendingPathComponent("node/bin/node")
  static let cli = resources.appendingPathComponent("app/node_modules/@courtos/local/bin/courtos-local.mjs")
  static let ocr = resources.appendingPathComponent("bin/ocr-vision")
  static let makeCertificate = resources.appendingPathComponent("make-certificate.sh")
  // HOME, as the server (Node) reads it; the account's home when unset.
  static let home = ProcessInfo.processInfo.environment["HOME"].map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser
  static let log = home.appendingPathComponent("Library/Logs/CourtOS/courtos.log")
  static let userCertificates = home.appendingPathComponent("Library/Application Support/CourtOS/certs")
  static let installedCertificates = URL(fileURLWithPath: "/Library/Application Support/CourtOS/certs")
  static let wordContainer = home.appendingPathComponent("Library/Containers/com.microsoft.Word")
  static let wordManifest = wordContainer.appendingPathComponent("Data/Documents/wef/courtos-local.xml")
}

/// Menu and dialog texts in the interface language: the one chosen in CourtOS, else the
/// system language, else German. The texts are in the package's src/menu.json.
enum Strings {
  static let table: [String: [String: String]] = {
    let url = Paths.resources.appendingPathComponent("app/node_modules/@courtos/local/src/menu.json")
    guard let data = try? Data(contentsOf: url) else { return [:] }
    return (try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]]) ?? [:]
  }()
  static let preferences = Paths.home.appendingPathComponent(".config/courtos/preferences.json")
  static var language = chosenLanguage()

  /// Read again on every status update, so the menu follows a language change in the browser.
  static func chosenLanguage() -> String {
    if let data = try? Data(contentsOf: preferences),
       let saved = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["language"] as? String,
       table[saved] != nil { return saved }
    let system = String((Locale.preferredLanguages.first ?? "de").prefix(2))
    return table[system] != nil ? system : "de"
  }

  static func t(_ key: String, _ values: [String: String] = [:]) -> String {
    var text = table[language]?[key] ?? table["de"]?[key] ?? key
    for (name, value) in values { text = text.replacingOccurrences(of: "{\(name)}", with: value) }
    return text
  }
}

func configuredPort() -> Int {
  if let value = ProcessInfo.processInfo.environment["COURTOS_PORT"], let port = Int(value) { return port }
  let port = UserDefaults.standard.integer(forKey: "Port")
  return port > 0 ? port : 4311
}

/// Runs a program and returns its exit status and output.
@discardableResult
func run(_ path: String, _ arguments: [String], environment: [String: String]? = nil) -> (status: Int32, output: String) {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: path)
  process.arguments = arguments
  if let environment { process.environment = environment }
  let pipe = Pipe()
  process.standardOutput = pipe
  process.standardError = pipe
  do { try process.run() } catch { return (-1, "\(error)") }
  let data = pipe.fileHandleForReading.readDataToEndOfFile()
  process.waitUntilExit()
  return (process.terminationStatus, String(decoding: data, as: UTF8.self))
}

// MARK: Certificate

/// The browser opens CourtOS without a warning, and Word loads it, only over https. A certificate
/// counts once macOS trusts it for localhost.
enum Certificate {
  static func trusted(in dir: URL) -> Bool {
    let cert = dir.appendingPathComponent("localhost.crt").path
    guard FileManager.default.fileExists(atPath: cert) else { return false }
    return run("/usr/bin/security", ["verify-cert", "-q", "-c", cert, "-p", "ssl", "-s", "localhost"]).status == 0
  }

  /// The folder the server should use, or nil when none is trusted (the browser then works over http).
  static func folder() -> URL? {
    if trusted(in: Paths.installedCertificates) { return Paths.installedCertificates }
    if trusted(in: Paths.userCertificates) { return Paths.userCertificates }
    return nil
  }

  /// Makes a certificate for this user and asks macOS to trust it; macOS asks for the password.
  static func create() -> Bool {
    let dir = Paths.userCertificates
    guard run("/bin/sh", [Paths.makeCertificate.path, dir.path]).status == 0 else { return false }
    let keychain = Paths.home.appendingPathComponent("Library/Keychains/login.keychain-db").path
    let added = run("/usr/bin/security", ["add-trusted-cert", "-r", "trustRoot", "-p", "ssl", "-k", keychain, dir.appendingPathComponent("ca.crt").path])
    return added.status == 0 && trusted(in: dir)
  }
}

// MARK: Server

final class Server {
  enum State { case starting, ready(String), failed(String) }
  private(set) var state: State = .starting
  private(set) var status: [String: Any] = [:]
  var onChange: (() -> Void)?
  let port: Int
  private var process: Process?
  private var input: FileHandle?
  private var buffer = Data()
  private var queued: [String] = []
  private var waiting: [(prefix: String, handler: (String) -> Void)] = []
  private var stopping = false
  private var log: FileHandle?

  init(port: Int) { self.port = port }

  var isReady: Bool { if case .ready = state { return true } else { return false } }
  var busy: Bool { status["busy"] as? Bool ?? false }

  func start(certificates: URL?) {
    state = .starting
    status = [:]
    buffer = Data()
    stopping = false
    let process = Process()
    process.executableURL = Paths.node
    process.arguments = [Paths.cli.path, "--control", "--port", String(port)]
    var environment = ProcessInfo.processInfo.environment
    environment["COURTOS_OCR_HELPER"] = Paths.ocr.path
    environment["COURTOS_APP"] = "1"
    if let certificates { environment["COURTOS_CERT_DIR"] = certificates.path }
    process.environment = environment
    process.currentDirectoryURL = Paths.home
    let stdin = Pipe(), stdout = Pipe()
    process.standardInput = stdin
    process.standardOutput = stdout
    process.standardError = stdout
    stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      if data.isEmpty { handle.readabilityHandler = nil; return }
      DispatchQueue.main.async { self?.receive(data) }
    }
    process.terminationHandler = { [weak self] ended in
      DispatchQueue.main.async { self?.ended(ended.terminationStatus) }
    }
    openLog()
    do { try process.run() } catch {
      state = .failed(Strings.t("startFailed"))
      onChange?()
      return
    }
    self.process = process
    self.input = stdin.fileHandleForWriting
    onChange?()
  }

  /// Sends a command; the handler gets the rest of the first answer line with this prefix.
  func ask(_ command: String, _ prefix: String, _ handler: @escaping (String) -> Void) {
    waiting.append((prefix, handler))
    if isReady { send(command) } else { queued.append(command) }
  }

  func requestStatus() {
    guard isReady else { return }
    ask("status", "COURTOS_STATUS") { [weak self] json in
      guard let self, let data = json.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
      self.status = object
      self.onChange?()
    }
  }

  func stop() {
    stopping = true
    try? input?.close()
    guard let process, process.isRunning else { return }
    let deadline = Date().addingTimeInterval(3)
    while process.isRunning && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    if process.isRunning { process.terminate() }
  }

  private func send(_ command: String) {
    try? input?.write(contentsOf: Data("\(command)\n".utf8))
  }

  private func receive(_ data: Data) {
    buffer.append(data)
    while let newline = buffer.firstIndex(of: 0x0A) {
      let line = String(decoding: buffer[buffer.startIndex..<newline], as: UTF8.self)
      buffer.removeSubrange(buffer.startIndex...newline)
      handle(line)
    }
  }

  private func handle(_ line: String) {
    if line.hasPrefix("COURTOS_READY ") {
      state = .ready(String(line.dropFirst("COURTOS_READY ".count)))
      queued.forEach(send)
      queued = []
      onChange?()
      requestStatus()
      return
    }
    if line.hasPrefix("COURTOS_ERROR port_in_use") {
      state = .failed(Strings.t("portBusy", ["port": String(port)]))
      onChange?()
      return
    }
    if let index = waiting.firstIndex(where: { line.hasPrefix($0.prefix + " ") }) {
      let waiter = waiting.remove(at: index)
      waiter.handler(String(line.dropFirst(waiter.prefix.count + 1)))
      return
    }
    // A one-time link is never written to the log.
    if !line.contains("#pair=") { write(line) }
  }

  private func ended(_ code: Int32) {
    process = nil
    input = nil
    waiting = []
    queued = []
    write("CourtOS beendet (\(code)).")
    if stopping { return }
    if case .failed = state { onChange?(); return }
    state = .failed(Strings.t("crashed"))
    onChange?()
  }

  private func openLog() {
    let dir = Paths.log.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: Paths.log.path) { FileManager.default.createFile(atPath: Paths.log.path, contents: nil) }
    log = try? FileHandle(forWritingTo: Paths.log)
    _ = try? log?.seekToEnd()
  }

  private func write(_ line: String) {
    let stamp = ISO8601DateFormatter().string(from: Date())
    try? log?.write(contentsOf: Data("\(stamp) \(line)\n".utf8))
  }
}

// MARK: Menu-bar app

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  let server = Server(port: configuredPort())
  let atLogin = CommandLine.arguments.contains("--login")
  var item: NSStatusItem!
  let statusLine = NSMenuItem(title: Strings.t("starting"), action: nil, keyEquivalent: "")
  let detailLine = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  var openItem: NSMenuItem!
  var restartItem: NSMenuItem!
  var titled: [(entry: NSMenuItem, key: String)] = []
  var timer: Timer?

  func applicationDidFinishLaunching(_ notification: Notification) {
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    let image = NSImage(systemSymbolName: "building.columns", accessibilityDescription: "CourtOS")
    image?.isTemplate = true
    item.button?.image = image
    item.button?.toolTip = "CourtOS"

    let menu = NSMenu()
    menu.autoenablesItems = false
    menu.delegate = self
    statusLine.isEnabled = false
    detailLine.isEnabled = false
    menu.addItem(statusLine)
    menu.addItem(detailLine)
    menu.addItem(.separator())
    openItem = add(menu, "open", #selector(openBrowser), "o")
    restartItem = add(menu, "restart", #selector(restart), "")
    add(menu, "installWord", #selector(installWord), "")
    add(menu, "certificate", #selector(setUpCertificate), "")
    add(menu, "log", #selector(showLog), "")
    menu.addItem(.separator())
    add(menu, "quit", #selector(quit), "q")
    item.menu = menu

    server.onChange = { [weak self] in self?.refresh() }
    var certificates = Certificate.folder()
    // A start by hand without a trusted certificate offers one before CourtOS starts, so the
    // browser opens over https without a warning and Word works at once. "Later" asks again at
    // the next start by hand; a start at login never interrupts with a dialog.
    if certificates == nil && !atLogin {
      if confirm(Strings.t("certOfferTitle"), Strings.t("certOfferMac"), Strings.t("setUp"), Strings.t("later")), Certificate.create() {
        certificates = Paths.userCertificates
      }
    }
    server.start(certificates: certificates)
    installWordIfMissing()
    if !atLogin { openBrowser() }
    timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.server.requestStatus() }
  }

  /// Opening CourtOS.app again while it runs opens the browser.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    openBrowser()
    return false
  }

  func applicationWillTerminate(_ notification: Notification) { server.stop() }

  func menuWillOpen(_ menu: NSMenu) {
    refresh()
    server.requestStatus()
  }

  @discardableResult
  private func add(_ menu: NSMenu, _ text: String, _ action: Selector, _ key: String) -> NSMenuItem {
    let entry = menu.addItem(withTitle: Strings.t(text), action: action, keyEquivalent: key)
    entry.target = self
    titled.append((entry, text))
    return entry
  }

  private func refresh() {
    Strings.language = Strings.chosenLanguage()
    for (entry, key) in titled { entry.title = Strings.t(key) }
    switch server.state {
    case .starting:
      statusLine.title = Strings.t("starting")
      detailLine.isHidden = true
    case .ready(let origin):
      let caseName = server.status["case"] as? String
      statusLine.title = Strings.t(server.busy ? "busy" : "running")
      let clients = server.status["clients"] as? [String: Int] ?? [:]
      var detail = caseName.map { Strings.t("case", ["name": $0]) } ?? origin
      if (clients["word"] ?? 0) > 0 { detail += " · " + Strings.t("wordConnected") }
      detailLine.title = detail
      detailLine.isHidden = false
    case .failed(let message):
      statusLine.title = Strings.t("stopped")
      detailLine.title = message
      detailLine.isHidden = false
    }
    openItem.isEnabled = server.isReady
    if case .failed = server.state { restartItem.isHidden = false } else { restartItem.isHidden = true }
  }

  @objc func openBrowser() {
    server.ask("pair", "COURTOS_PAIR") { link in
      if let url = URL(string: link) { NSWorkspace.shared.open(url) }
    }
  }

  @objc func restart() {
    server.stop()
    server.start(certificates: Certificate.folder())
  }

  @objc func setUpCertificate() {
    if Certificate.folder() != nil {
      inform(Strings.t("certReady"), Strings.t("certReadyText"))
      return
    }
    if Certificate.create() {
      restart()
      inform(Strings.t("certReady"), Strings.t("certRestarted"))
    } else {
      inform(Strings.t("certFailed"), Strings.t("certFailedText"))
    }
  }

  /// The add-in is set up on the first start when Word is installed; later only on request.
  private func installWordIfMissing() {
    guard FileManager.default.fileExists(atPath: Paths.wordContainer.path),
          !FileManager.default.fileExists(atPath: Paths.wordManifest.path),
          !UserDefaults.standard.bool(forKey: "WordOffered") else { return }
    UserDefaults.standard.set(true, forKey: "WordOffered")
    _ = sideload()
  }

  private func sideload() -> Bool {
    run(Paths.node.path, [Paths.cli.path, "install-word", "--port", String(server.port)]).status == 0
      && FileManager.default.fileExists(atPath: Paths.wordManifest.path)
  }

  @objc func installWord() {
    if sideload() {
      inform(Strings.t("wordReady"), Strings.t("wordReadyMac"))
    } else {
      inform(Strings.t("wordFailed"), Strings.t("wordFailedText"))
    }
  }

  @objc func showLog() { NSWorkspace.shared.open(Paths.log) }

  @objc func quit() {
    if server.busy && !confirm(Strings.t("busyTitle"), Strings.t("busyText"), Strings.t("quitAnyway"), Strings.t("cancel")) { return }
    NSApp.terminate(nil)
  }

  private func confirm(_ title: String, _ text: String, _ yes: String, _ no: String) -> Bool {
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = text
    alert.addButton(withTitle: yes)
    alert.addButton(withTitle: no)
    return alert.runModal() == .alertFirstButtonReturn
  }

  private func inform(_ title: String, _ text: String) {
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = text
    alert.runModal()
  }
}

// MARK: Start

signal(SIGPIPE, SIG_IGN)

if CommandLine.arguments.contains("--check") {
  // For IT: does the installed app start, and does it hand out a link?
  let server = Server(port: configuredPort())
  server.onChange = {
    if case .failed(let message) = server.state { print(message); exit(1) }
  }
  let certificates = Certificate.folder()
  print("Zertifikat: \(certificates?.path ?? "keines (nur Browser über http)")")
  server.start(certificates: certificates)
  server.ask("pair", "COURTOS_PAIR") { link in
    print(link)
    server.ask("status", "COURTOS_STATUS") { json in
      print(json)
      server.stop()
      exit(0)
    }
  }
  DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("Keine Antwort von CourtOS."); exit(1) }
  RunLoop.main.run()
}

// One CourtOS per user: a second start hands over to the first.
let others = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "ch.courtos.local")
  .filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
if let running = others.first {
  running.activate()
  exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
