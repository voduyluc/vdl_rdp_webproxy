using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RdpHostAgent;
using RdpHostAgent.Services;

namespace RdpHostAgent
{
    public class Program
    {
        public static void Main(string[] args)
        {
            // Helper mode: invoked by the service's Session-0 bypass to run in a user session.
            if (args.Contains("--get-windows"))
            {
                Console.OutputEncoding = System.Text.Encoding.UTF8;
                var windows = WindowManager.EnumVisibleWindows();
                Console.WriteLine(Newtonsoft.Json.JsonConvert.SerializeObject(windows));
                return;
            }

            if (args.Contains("--focus-window"))
            {
                int idx = Array.IndexOf(args, "--focus-window");
                if (idx + 1 < args.Length && long.TryParse(args[idx + 1], out long hwnd))
                {
                    int? targetWidth = null, targetHeight = null;
                    if (idx + 3 < args.Length
                        && int.TryParse(args[idx + 2], out int tw)
                        && int.TryParse(args[idx + 3], out int th))
                    {
                        targetWidth = tw;
                        targetHeight = th;
                    }
                    Console.OutputEncoding = System.Text.Encoding.UTF8;
                    var (rect, resizable) = WindowManager.FocusWindowDirect(hwnd, targetWidth, targetHeight);
                    Console.WriteLine(Newtonsoft.Json.JsonConvert.SerializeObject(new { rect, resizable }));
                }
                return;
            }

            if (args.Contains("--set-passcode"))
            {
                ConfigurePasscodeInteractive();
                return;
            }

            // Interactive mode fallback
            if (Environment.UserInteractive)
            {
                string appSettingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
                bool needsPasscode = true;
                if (File.Exists(appSettingsPath))
                {
                    try
                    {
                        string json = File.ReadAllText(appSettingsPath);
                        var jsonObj = JsonConvert.DeserializeObject<JObject>(json);
                        var passcodeHash = jsonObj?["AgentConfig"]?["PasscodeHash"]?.ToString();
                        if (!string.IsNullOrEmpty(passcodeHash))
                        {
                            needsPasscode = false;
                        }
                    }
                    catch
                    {
                        // JSON read error, require configuration
                    }
                }

                if (needsPasscode)
                {
                    Console.WriteLine("==================================================");
                    Console.WriteLine("WARNING: No passcode configured for Agent.");
                    Console.WriteLine("Passcode is required for secure client connection.");
                    Console.WriteLine("==================================================");
                    ConfigurePasscodeInteractive();
                }
            }

            var builder = Host.CreateApplicationBuilder(args);

            // Register Windows Service Lifetime
            builder.Services.AddWindowsService(options =>
            {
                options.ServiceName = "RdpHostAgent";
            });

            builder.Services.Configure<AgentConfig>(builder.Configuration.GetSection("AgentConfig"));
            builder.Services.AddSingleton<DataTunnelBridge>();
            builder.Services.AddHostedService<Worker>();

            var host = builder.Build();
            host.Run();
        }

        private static void ConfigurePasscodeInteractive()
        {
            Console.WriteLine("--- Host Agent Passcode Configuration ---");
            string passcode;
            while (true)
            {
                Console.Write("Enter new passcode (min 6 chars): ");
                passcode = ReadPassword();
                if (string.IsNullOrWhiteSpace(passcode))
                {
                    Console.WriteLine("Passcode cannot be empty. Try again.");
                    continue;
                }
                if (passcode.Length < 6)
                {
                    Console.WriteLine("Passcode must be at least 6 characters. Try again.");
                    continue;
                }
                Console.Write("Confirm passcode: ");
                string confirm = ReadPassword();
                if (passcode == confirm)
                {
                    break;
                }
                Console.WriteLine("Passcodes do not match. Try again.\n");
            }

            string hash = HashPasscode(passcode);
            UpdateAppsettingsPasscodeHash(hash);
            Console.WriteLine("Passcode configured successfully and saved to appsettings.json.");
        }

        private static string ReadPassword()
        {
            StringBuilder sb = new StringBuilder();
            while (true)
            {
                ConsoleKeyInfo key = Console.ReadKey(true);
                if (key.Key == ConsoleKey.Enter)
                {
                    Console.WriteLine();
                    break;
                }
                if (key.Key == ConsoleKey.Backspace)
                {
                    if (sb.Length > 0)
                    {
                        sb.Remove(sb.Length - 1, 1);
                        Console.Write("\b \b");
                    }
                }
                else if (key.KeyChar != '\u0000')
                {
                    sb.Append(key.KeyChar);
                    Console.Write("*");
                }
            }
            return sb.ToString();
        }

        private static string HashPasscode(string passcode)
        {
            byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(passcode));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }

        private static void UpdateAppsettingsPasscodeHash(string hash)
        {
            string appSettingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            try
            {
                JObject jsonObj;
                if (File.Exists(appSettingsPath))
                {
                    string json = File.ReadAllText(appSettingsPath);
                    jsonObj = JsonConvert.DeserializeObject<JObject>(json) ?? new JObject();
                }
                else
                {
                    jsonObj = new JObject();
                }

                if (jsonObj["AgentConfig"] == null)
                {
                    jsonObj["AgentConfig"] = new JObject();
                }

                jsonObj["AgentConfig"]!["PasscodeHash"] = hash;

                string output = JsonConvert.SerializeObject(jsonObj, Formatting.Indented);
                File.WriteAllText(appSettingsPath, output);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error writing to appsettings.json: {ex.Message}");
            }
        }
    }
}
