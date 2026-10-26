using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Windows GUI subsystem: neither this host nor its children create a console.
// This file belongs to the pet bridge; no installed client files are changed.
internal static class BridgeHost
{
    private static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();

    private static string Quote(string value)
    {
        // Windows CommandLineToArgvW quoting; no shell is involved.
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); }
            else { result.Append('\\', slashes); }
            result.Append(c); slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }

    private static void WriteRecord(string name, object value, bool append)
    {
        string line = Json.Serialize(value) + Environment.NewLine;
        string target = Path.Combine(Root, ".runtime", name);
        if (append) File.AppendAllText(target, line, new UTF8Encoding(false));
        else File.WriteAllText(target, line, new UTF8Encoding(false));
    }

    [STAThread]
    private static int Main(string[] args)
    {
        string mode = args.Length == 0 ? "launch" : args[0];
        try
        {
            if (args.Length > 1 || (mode != "launch" && mode != "controller" && mode != "stop"))
                throw new ArgumentException("Expected launch, controller, or stop.");
            var config = Json.Deserialize<Dictionary<string, string>>(
                File.ReadAllText(Path.Combine(Root, ".runtime", "host-config.json")));
            int port;
            if (!Int32.TryParse(config["port"], out port) || port < 1024 || port > 65535)
                throw new ArgumentException("Invalid local debugging port.");
            string executable = config[mode == "controller" ? "node" : "powershell"];
            string expected = mode == "controller" ? "node.exe" : "pwsh.exe";
            if (!Path.IsPathRooted(executable) || !File.Exists(executable) ||
                !String.Equals(Path.GetFileName(executable), expected, StringComparison.OrdinalIgnoreCase))
                throw new IOException("Bridge runtime not found: " + expected);

            var info = new ProcessStartInfo(executable);
            info.WorkingDirectory = Root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            info.Arguments = mode == "controller"
                ? Quote(Path.Combine(Root, "controller.mjs")) + " run " + port
                : "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File " +
                    Quote(Path.Combine(Root, mode == "stop" ? "stop-bridge.ps1" : "launch-native.ps1"));
            using (Process child = Process.Start(info))
            {
                if (mode == "controller") WriteRecord("host.json", new {
                    hostPid = Process.GetCurrentProcess().Id, nodePid = child.Id,
                    hidden = true, consoleAttached = GetConsoleWindow() != IntPtr.Zero,
                    host = "windowless-gui", startedAt = DateTimeOffset.Now.ToString("o")
                }, false);
                var stdout = child.StandardOutput.ReadToEndAsync();
                var stderr = child.StandardError.ReadToEndAsync();
                child.WaitForExit();
                string output = stdout.GetAwaiter().GetResult();
                string error = stderr.GetAwaiter().GetResult();
                WriteRecord(mode == "controller" ? "host-exits.jsonl" : "windowless-launch.jsonl", new {
                    at = DateTimeOffset.Now.ToString("o"), mode = mode,
                    exitCode = child.ExitCode, childPid = child.Id,
                    consoleAttached = GetConsoleWindow() != IntPtr.Zero,
                    stdout = output, stderr = error
                }, true);
                if (child.ExitCode != 0 && mode != "controller")
                    MessageBox.Show("大肥鱼启动未完成。\n\n" + error + "\n诊断记录：" + Root,
                        "Codex 大肥鱼", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            try { WriteRecord("windowless-errors.jsonl", new {
                at = DateTimeOffset.Now.ToString("o"), mode = mode, error = error.ToString()
            }, true); } catch { }
            if (mode != "controller") MessageBox.Show(error.Message, "Codex 大肥鱼",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }
}
