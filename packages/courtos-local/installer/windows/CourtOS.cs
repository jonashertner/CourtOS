// CourtOS tray app for Windows. It starts the local server (courtos-local --control) with the
// bundled Node runtime, opens the browser already paired, shows the status, and sets up the
// Word add-in and the localhost certificate. The server ends when this app ends.
//
//   CourtOS.exe                        start; open the browser when CourtOS is ready
//   CourtOS.exe --login                start at login (Run key); no browser
//   CourtOS.exe --check                start, print a one-time link and the status, end (for IT)
//   CourtOS.exe --install-certificate  installer, elevated: a certificate for all users
//   CourtOS.exe --remove-certificate   uninstaller, elevated
//
// The port is 4311, or HKLM\Software\CourtOS\Port, or COURTOS_PORT.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

static class Paths
{
    public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    public static readonly string Node = Path.Combine(Root, "node", "node.exe");
    public static readonly string Cli = Path.Combine(Root, "app", "node_modules", "@courtos", "local", "bin", "courtos-local.mjs");
    public static readonly string LocalData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CourtOS");
    public static readonly string Log = Path.Combine(LocalData, "courtos.log");
    public static readonly string UserCertificates = Path.Combine(LocalData, "certs");
    public static readonly string InstalledCertificates = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "CourtOS", "certs");
    public static readonly string WordManifest = Path.Combine(LocalData, "courtos-local.xml");
}

/// Menu and dialog texts in the interface language: the one chosen in CourtOS, else the
/// Windows display language, else German. The texts are in the package's src/menu.json.
static class Strings
{
    static readonly Dictionary<string, Dictionary<string, string>> Table = Load();
    // The home folder as the server (Node) reads it.
    static readonly string Preferences = Path.Combine(Environment.GetEnvironmentVariable("USERPROFILE") ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "courtos", "preferences.json");
    public static string Language = Chosen();

    static Dictionary<string, Dictionary<string, string>> Load()
    {
        try { return new JavaScriptSerializer().Deserialize<Dictionary<string, Dictionary<string, string>>>(File.ReadAllText(Path.Combine(Paths.Root, "app", "node_modules", "@courtos", "local", "src", "menu.json"), Encoding.UTF8)); }
        catch (Exception error) when (error is IOException || error is UnauthorizedAccessException || error is ArgumentException || error is InvalidOperationException) { return new Dictionary<string, Dictionary<string, string>>(); }
    }

    /// Read again on every status update, so the menu follows a language change in the browser.
    public static string Chosen()
    {
        try
        {
            if (new JavaScriptSerializer().DeserializeObject(File.ReadAllText(Preferences, Encoding.UTF8)) is Dictionary<string, object> saved
                && saved.TryGetValue("language", out var value) && value is string language && Table.ContainsKey(language)) return language;
        }
        catch (Exception error) when (error is IOException || error is UnauthorizedAccessException || error is ArgumentException || error is InvalidOperationException) { }
        var system = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        return Table.ContainsKey(system) ? system : "de";
    }

    public static string T(string key, params (string name, string value)[] values)
    {
        string text = null;
        if (!(Table.TryGetValue(Language, out var strings) && strings.TryGetValue(key, out text))
            && !(Table.TryGetValue("de", out strings) && strings.TryGetValue(key, out text))) text = key;
        foreach (var (name, value) in values) text = text.Replace("{" + name + "}", value);
        return text;
    }
}

static class Settings
{
    const string UserKey = @"Software\CourtOS";

    public static int Port()
    {
        if (int.TryParse(Environment.GetEnvironmentVariable("COURTOS_PORT"), out var port) && port > 0) return port;
        using (var key = Registry.LocalMachine.OpenSubKey(@"Software\CourtOS"))
            if (key?.GetValue("Port") is int configured && configured > 0) return configured;
        return 4311;
    }

    public static bool Once(string name)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(UserKey))
        {
            if (key.GetValue(name) != null) return false;
            key.SetValue(name, 1, RegistryValueKind.DWord);
            return true;
        }
    }
}

// Word loads add-ins over https only. A certificate counts once Windows trusts it.
static class Certificate
{
    const string Subject = "CN=CourtOS localhost, O=CourtOS";
    // NameConstraints: permitted DNS "localhost" and IP 127.0.0.1/32 (the same bytes as
    // installer/macos/make-certificate.sh writes). The authority can sign nothing else.
    static readonly byte[] LocalhostOnly = Hex("301ba019300b82096c6f63616c686f7374300a87087f000001ffffffff");

    public static bool Trusted(string dir)
    {
        var path = Path.Combine(dir, "localhost.crt");
        if (!File.Exists(path)) return false;
        try
        {
            using (var cert = new X509Certificate2(path))
            using (var chain = new X509Chain())
            {
                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                return cert.NotAfter > DateTime.Now.AddDays(1) && chain.Build(cert);
            }
        }
        catch (CryptographicException) { return false; }
    }

    public static string Folder()
    {
        if (Trusted(Paths.InstalledCertificates)) return Paths.InstalledCertificates;
        if (Trusted(Paths.UserCertificates)) return Paths.UserCertificates;
        return null;
    }

    /// Makes an authority restricted to localhost, signs one certificate for https://localhost,
    /// trusts the authority in the given store and forgets its key: it never touches the disk.
    /// For the current user Windows asks for confirmation.
    public static bool Create(string dir, StoreLocation location)
    {
        try
        {
            var now = DateTimeOffset.UtcNow;
            using (var caKey = NewKey())
            using (var leafKey = NewKey())
            {
                var caRequest = new CertificateRequest(Subject, caKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                caRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, true, 0, true));
                caRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
                caRequest.CertificateExtensions.Add(new X509Extension("2.5.29.30", LocalhostOnly, true));
                var caKeyId = new X509SubjectKeyIdentifierExtension(caRequest.PublicKey, false);
                caRequest.CertificateExtensions.Add(caKeyId);
                using (var ca = caRequest.CreateSelfSigned(now.AddDays(-1), now.AddYears(10)))
                {
                    var request = new CertificateRequest("CN=localhost", leafKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                    request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
                    request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
                    request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false));
                    var names = new SubjectAlternativeNameBuilder();
                    names.AddDnsName("localhost");
                    names.AddIpAddress(IPAddress.Loopback);
                    request.CertificateExtensions.Add(names.Build());
                    // AuthorityKeyIdentifier: SEQUENCE { [0] keyIdentifier }
                    var keyId = Hex(caKeyId.SubjectKeyIdentifier);
                    request.CertificateExtensions.Add(new X509Extension("2.5.29.35", new byte[] { 0x30, (byte)(keyId.Length + 2), 0x80, (byte)keyId.Length }.Concat(keyId).ToArray(), false));
                    var serial = new byte[16];
                    using (var random = RandomNumberGenerator.Create()) random.GetBytes(serial);
                    serial[0] &= 0x7f;
                    using (var leaf = request.Create(ca, now.AddDays(-1), now.AddDays(825), serial))
                    {
                        Directory.CreateDirectory(dir);
                        File.WriteAllText(Path.Combine(dir, "localhost.crt"), Pem("CERTIFICATE", leaf.RawData));
                        File.WriteAllText(Path.Combine(dir, "localhost.key"), Pem("RSA PRIVATE KEY", Pkcs1(leafKey.ExportParameters(true))));
                        File.WriteAllText(Path.Combine(dir, "ca.crt"), Pem("CERTIFICATE", ca.RawData));
                    }
                    using (var store = new X509Store(StoreName.Root, location))
                    {
                        store.Open(OpenFlags.ReadWrite);
                        foreach (var old in store.Certificates.Find(X509FindType.FindBySubjectDistinguishedName, Subject, false)) store.Remove(old);
                        using (var publicOnly = new X509Certificate2(ca.RawData)) store.Add(publicOnly);
                    }
                }
            }
            return Trusted(dir);
        }
        catch (Exception error) when (error is CryptographicException || error is IOException || error is UnauthorizedAccessException)
        {
            return false;
        }
    }

    // An explicit export policy: the server's key is written out as PEM.
    static RSA NewKey() => new RSACng(CngKey.Create(CngAlgorithm.Rsa, null, new CngKeyCreationParameters
    {
        ExportPolicy = CngExportPolicies.AllowPlaintextExport,
        Parameters = { new CngProperty("Length", BitConverter.GetBytes(2048), CngPropertyOptions.None) },
    }));

    public static void Remove(string dir, StoreLocation location)
    {
        try
        {
            using (var store = new X509Store(StoreName.Root, location))
            {
                store.Open(OpenFlags.ReadWrite);
                foreach (var old in store.Certificates.Find(X509FindType.FindBySubjectDistinguishedName, Subject, false)) store.Remove(old);
            }
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }
        catch (Exception error) when (error is CryptographicException || error is IOException || error is UnauthorizedAccessException) { }
    }

    static string Pem(string label, byte[] der)
    {
        var text = new StringBuilder($"-----BEGIN {label}-----\n");
        var base64 = Convert.ToBase64String(der);
        for (var i = 0; i < base64.Length; i += 64) text.Append(base64, i, Math.Min(64, base64.Length - i)).Append('\n');
        return text.Append($"-----END {label}-----\n").ToString();
    }

    // RSAPrivateKey (PKCS #1): SEQUENCE { 0, n, e, d, p, q, dp, dq, qinv }
    static byte[] Pkcs1(RSAParameters key)
    {
        var body = new List<byte>();
        foreach (var value in new[] { new byte[] { 0 }, key.Modulus, key.Exponent, key.D, key.P, key.Q, key.DP, key.DQ, key.InverseQ })
        {
            var digits = value.SkipWhile((b, i) => b == 0 && i < value.Length - 1).ToList();
            if ((digits[0] & 0x80) != 0) digits.Insert(0, 0);
            body.Add(0x02);
            body.AddRange(Length(digits.Count));
            body.AddRange(digits);
        }
        return new byte[] { 0x30 }.Concat(Length(body.Count)).Concat(body).ToArray();
    }

    static byte[] Length(int n) =>
        n < 0x80 ? new[] { (byte)n } : n < 0x100 ? new byte[] { 0x81, (byte)n } : new byte[] { 0x82, (byte)(n >> 8), (byte)n };

    static byte[] Hex(string hex) =>
        Enumerable.Range(0, hex.Length / 2).Select(i => Convert.ToByte(hex.Substring(i * 2, 2), 16)).ToArray();
}

sealed class Server
{
    public enum State { Starting, Ready, Failed }
    public State Current { get; private set; } = State.Starting;
    public string Origin { get; private set; }
    public string Problem { get; private set; }
    public bool Busy { get; private set; }
    public string Case { get; private set; }
    public bool WordConnected { get; private set; }
    public event Action Changed;
    public readonly int Port;

    readonly SynchronizationContext ui;
    Process process;
    bool stopping;
    readonly List<string> queued = new List<string>();
    readonly List<KeyValuePair<string, Action<string>>> waiting = new List<KeyValuePair<string, Action<string>>>();

    public Server(int port, SynchronizationContext context) { Port = port; ui = context; }

    public void Start(string certificates)
    {
        Current = State.Starting;
        Problem = null;
        stopping = false;
        var info = new ProcessStartInfo(Paths.Node, $"\"{Paths.Cli}\" --control --port {Port}")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        };
        info.EnvironmentVariables["COURTOS_APP"] = "1";
        if (certificates != null) info.EnvironmentVariables["COURTOS_CERT_DIR"] = certificates;
        // Events of a server that was restarted since arrive late; only the current one counts.
        var started = new Process { StartInfo = info, EnableRaisingEvents = true };
        process = started;
        started.OutputDataReceived += (s, e) => { if (e.Data != null) ui.Post(_ => { if (process == started) Handle(e.Data); }, null); };
        started.ErrorDataReceived += (s, e) => { if (e.Data != null) ui.Post(_ => Write(e.Data), null); };
        started.Exited += (s, e) => ui.Post(_ => { if (process == started) Ended(); }, null);
        try
        {
            process.Start();
            process.StandardInput.AutoFlush = true;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception || error is InvalidOperationException)
        {
            Fail(Strings.T("startFailed"));
        }
        Changed?.Invoke();
    }

    /// Sends a command; the handler gets the rest of the first answer line with this prefix.
    public void Ask(string command, string prefix, Action<string> handler)
    {
        waiting.Add(new KeyValuePair<string, Action<string>>(prefix, handler));
        if (Current == State.Ready) Send(command); else queued.Add(command);
    }

    public void RequestStatus()
    {
        if (Current != State.Ready) return;
        Ask("status", "COURTOS_STATUS", json =>
        {
            // {"origin":"…","busy":false,"case":"…"|null,"clients":{"web":0,"word":0}}
            Busy = json.Contains("\"busy\":true");
            var at = json.IndexOf("\"case\":\"", StringComparison.Ordinal);
            var end = at < 0 ? -1 : json.IndexOf("\",\"clients\"", at, StringComparison.Ordinal);
            Case = end < 0 ? null : Unescape(json.Substring(at + 8, end - at - 8));
            WordConnected = !json.Contains("\"word\":0");
            Changed?.Invoke();
        });
    }

    public void Stop()
    {
        stopping = true;
        if (process == null) return;
        try
        {
            process.StandardInput.Close();
            if (!process.WaitForExit(3000)) process.Kill();
        }
        catch (Exception error) when (error is InvalidOperationException || error is System.ComponentModel.Win32Exception || error is IOException) { }
    }

    void Send(string command)
    {
        try { process.StandardInput.WriteLine(command); } catch (Exception error) when (error is IOException || error is InvalidOperationException) { }
    }

    void Handle(string line)
    {
        if (line.StartsWith("COURTOS_READY ", StringComparison.Ordinal))
        {
            Origin = line.Substring("COURTOS_READY ".Length);
            Current = State.Ready;
            foreach (var command in queued) Send(command);
            queued.Clear();
            Changed?.Invoke();
            RequestStatus();
            return;
        }
        if (line.StartsWith("COURTOS_ERROR port_in_use", StringComparison.Ordinal))
        {
            Fail(Strings.T("portBusy", ("port", Port.ToString(CultureInfo.InvariantCulture))));
            return;
        }
        var index = waiting.FindIndex(w => line.StartsWith(w.Key + " ", StringComparison.Ordinal));
        if (index >= 0)
        {
            var waiter = waiting[index];
            waiting.RemoveAt(index);
            waiter.Value(line.Substring(waiter.Key.Length + 1));
            return;
        }
        // A one-time link is never written to the log.
        if (!line.Contains("#pair=")) Write(line);
    }

    void Ended()
    {
        waiting.Clear();
        queued.Clear();
        Write($"CourtOS beendet ({(process.HasExited ? process.ExitCode : -1)}).");
        if (stopping || Current == State.Failed) { Changed?.Invoke(); return; }
        Fail(Strings.T("crashed"));
    }

    void Fail(string message)
    {
        Current = State.Failed;
        Problem = message;
        Changed?.Invoke();
    }

    static void Write(string line)
    {
        try
        {
            Directory.CreateDirectory(Paths.LocalData);
            File.AppendAllText(Paths.Log, $"{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ} {line}\r\n", new UTF8Encoding(false));
        }
        catch (IOException) { }
    }

    static string Unescape(string json) =>
        System.Text.RegularExpressions.Regex.Unescape(json);
}

sealed class Tray : ApplicationContext
{
    readonly Server server;
    readonly NotifyIcon icon;
    readonly ToolStripMenuItem statusLine = new ToolStripMenuItem(Strings.T("starting")) { Enabled = false };
    readonly ToolStripMenuItem detailLine = new ToolStripMenuItem("") { Enabled = false, Visible = false };
    readonly ToolStripMenuItem openItem, restartItem;
    readonly List<(ToolStripMenuItem item, string key)> titled = new List<(ToolStripMenuItem item, string key)>();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 5000 };

    public Tray(bool atLogin, EventWaitHandle openRequests)
    {
        server = new Server(Settings.Port(), SynchronizationContext.Current);
        var menu = new ContextMenuStrip();
        menu.Items.Add(statusLine);
        menu.Items.Add(detailLine);
        menu.Items.Add(new ToolStripSeparator());
        openItem = Add(menu, "open", OpenBrowser);
        openItem.Font = new Font(openItem.Font, FontStyle.Bold);
        restartItem = Add(menu, "restart", Restart);
        Add(menu, "installWord", InstallWord);
        Add(menu, "certificate", SetUpCertificate);
        Add(menu, "log", () => { if (File.Exists(Paths.Log)) Process.Start(new ProcessStartInfo(Paths.Log) { UseShellExecute = true }); });
        menu.Items.Add(new ToolStripSeparator());
        Add(menu, "quit", Quit);
        menu.Opening += (s, e) => { Refresh(); server.RequestStatus(); };

        icon = new NotifyIcon { Icon = AppIcon(), Text = "CourtOS", ContextMenuStrip = menu, Visible = true };
        icon.MouseDoubleClick += (s, e) => OpenBrowser();
        server.Changed += Refresh;

        var certificates = Certificate.Folder();
        // A start by hand without a trusted certificate offers one before CourtOS starts, so the
        // browser opens over https without a warning and Word works at once. "Later" asks again at
        // the next start by hand; a start at login never interrupts with a dialog.
        if (certificates == null && !atLogin
            && Ask(Strings.T("certOfferWin") + "\n\n" + Strings.T("certOfferTitle"))
            && Certificate.Create(Paths.UserCertificates, StoreLocation.CurrentUser))
            certificates = Paths.UserCertificates;
        server.Start(certificates);
        if (Settings.Once("WordOffered")) Sideload();
        if (!atLogin) OpenBrowser();
        timer.Tick += (s, e) => server.RequestStatus();
        timer.Start();

        // A second start (Start menu, double-click) asks this one to open the browser.
        var context = SynchronizationContext.Current;
        new Thread(() => { while (openRequests.WaitOne()) context.Post(_ => OpenBrowser(), null); }) { IsBackground = true }.Start();
        Refresh();
    }

    ToolStripMenuItem Add(ContextMenuStrip menu, string key, Action action)
    {
        var item = new ToolStripMenuItem(Strings.T(key));
        item.Click += (s, e) => action();
        menu.Items.Add(item);
        titled.Add((item, key));
        return item;
    }

    static Icon AppIcon()
    {
        using (var stream = typeof(Tray).Assembly.GetManifestResourceStream("icon.png"))
        using (var bitmap = new Bitmap(stream))
            return Icon.FromHandle(bitmap.GetHicon());
    }

    void Refresh()
    {
        Strings.Language = Strings.Chosen();
        foreach (var (item, key) in titled) item.Text = Strings.T(key);
        switch (server.Current)
        {
            case Server.State.Starting:
                statusLine.Text = Strings.T("starting");
                detailLine.Visible = false;
                break;
            case Server.State.Ready:
                statusLine.Text = Strings.T(server.Busy ? "busy" : "running");
                detailLine.Text = (server.Case != null ? Strings.T("case", ("name", server.Case)) : server.Origin) + (server.WordConnected ? " · " + Strings.T("wordConnected") : "");
                detailLine.Visible = true;
                break;
            case Server.State.Failed:
                statusLine.Text = Strings.T("stopped");
                detailLine.Text = server.Problem;
                detailLine.Visible = true;
                break;
        }
        openItem.Enabled = server.Current == Server.State.Ready;
        restartItem.Visible = server.Current == Server.State.Failed;
        var tip = $"CourtOS – {statusLine.Text}";
        icon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
    }

    void OpenBrowser() =>
        server.Ask("pair", "COURTOS_PAIR", link => Process.Start(new ProcessStartInfo(link) { UseShellExecute = true }));

    void Restart()
    {
        server.Stop();
        server.Start(Certificate.Folder());
    }

    void SetUpCertificate()
    {
        if (Certificate.Folder() != null) { Inform(Strings.T("certReady") + " " + Strings.T("certReadyText")); return; }
        if (Certificate.Create(Paths.UserCertificates, StoreLocation.CurrentUser))
        {
            Restart();
            Inform(Strings.T("certReady") + " " + Strings.T("certRestarted"));
        }
        else Inform(Strings.T("certFailed") + " " + Strings.T("certFailedText"));
    }

    bool Sideload()
    {
        var info = new ProcessStartInfo(Paths.Node, $"\"{Paths.Cli}\" install-word --port {server.Port}") { UseShellExecute = false, CreateNoWindow = true };
        try
        {
            using (var process = Process.Start(info))
            {
                process.WaitForExit(30000);
                return process.ExitCode == 0 && File.Exists(Paths.WordManifest);
            }
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception || error is InvalidOperationException) { return false; }
    }

    void InstallWord()
    {
        if (Sideload()) Inform(Strings.T("wordReady") + " " + Strings.T("wordReadyWin"));
        else Inform(Strings.T("wordFailed") + " " + Strings.T("wordFailedText"));
    }

    void Quit()
    {
        if (server.Busy && !Ask(Strings.T("busyTitle") + " " + Strings.T("busyText") + "\n\n" + Strings.T("quitQuestion"))) return;
        timer.Stop();
        server.Stop();
        icon.Visible = false;
        ExitThread();
    }

    static bool Ask(string text) =>
        MessageBox.Show(text, "CourtOS", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

    static void Inform(string text) =>
        MessageBox.Show(text, "CourtOS", MessageBoxButtons.OK, MessageBoxIcon.Information);
}

static class Program
{
    [DllImport("kernel32.dll")]
    static extern bool AttachConsole(int processId);

    [STAThread]
    static int Main(string[] args)
    {
        // An update keeps a certificate that is still trusted: Word has nothing to relearn.
        if (args.Contains("--install-certificate"))
            return Certificate.Trusted(Paths.InstalledCertificates) || Certificate.Create(Paths.InstalledCertificates, StoreLocation.LocalMachine) ? 0 : 1;
        if (args.Contains("--remove-certificate"))
        {
            Certificate.Remove(Paths.InstalledCertificates, StoreLocation.LocalMachine);
            return 0;
        }
        if (args.Contains("--check")) return Check();

        // One CourtOS per user: a second start asks the first to open the browser.
        using (var single = new Mutex(true, @"Local\CourtOS", out var first))
        using (var openRequests = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\CourtOS.Open"))
        {
            if (!first) { openRequests.Set(); return 0; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
            Application.Run(new Tray(args.Contains("--login"), openRequests));
            return 0;
        }
    }

    // For IT: does the installed app start, and does it hand out a link?
    static int Check()
    {
        AttachConsole(-1);
        var context = new WindowsFormsSynchronizationContext();
        SynchronizationContext.SetSynchronizationContext(context);
        var certificates = Certificate.Folder();
        Console.WriteLine($"Zertifikat: {certificates ?? "keines (nur Browser über http)"}");
        var server = new Server(Settings.Port(), context);
        var code = 1;
        server.Changed += () => { if (server.Current == Server.State.Failed) { Console.WriteLine(server.Problem); Application.ExitThread(); } };
        server.Start(certificates);
        server.Ask("pair", "COURTOS_PAIR", link =>
        {
            Console.WriteLine(link);
            server.Ask("status", "COURTOS_STATUS", json => { Console.WriteLine(json); code = 0; server.Stop(); Application.ExitThread(); });
        });
        var timeout = new System.Windows.Forms.Timer { Interval = 60000 };
        timeout.Tick += (s, e) => { Console.WriteLine("Keine Antwort von CourtOS."); Application.ExitThread(); };
        timeout.Start();
        Application.Run();
        return code;
    }
}
