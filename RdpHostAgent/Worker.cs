using System.Net.WebSockets;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using RdpHostAgent.Services;

namespace RdpHostAgent
{
    public class Worker : BackgroundService
    {
        private readonly ILogger<Worker> _logger;
        private readonly AgentConfig _config;
        private readonly DataTunnelBridge _tunnelBridge;

        public Worker(ILogger<Worker> logger, IOptions<AgentConfig> config, DataTunnelBridge tunnelBridge)
        {
            _logger = logger;
            _config = config.Value;
            _tunnelBridge = tunnelBridge;
        }

        // If ReceiveAsync stays silent longer than this, the connection is considered dead.
        // WS ping frames are answered internally and never complete ReceiveAsync, so the
        // server sends a 1-byte binary keepalive every 30 s (skipped below) to reset this.
        private static readonly TimeSpan ReceiveTimeout = TimeSpan.FromSeconds(90);

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            int retryDelay = 5;
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var client = new ClientWebSocket();
                    client.Options.DangerousDeflateOptions = new WebSocketDeflateOptions
                    {
                        ClientContextTakeover = false,
                        ServerContextTakeover = false
                    };
                    // Agent sends WebSocket-level pings every 20 s.
                    // If no pong arrives within KeepAliveInterval the runtime aborts the socket.
                    client.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);

                    _logger.LogInformation("Connecting to Control Channel: {Url}", _config.ProxyControlUrl);

                    Uri serverUri = new Uri($"{_config.ProxyControlUrl}?agentId={_config.AgentId}&token={_config.SecretToken}&passcodeHash={_config.PasscodeHash}");
                    await client.ConnectAsync(serverUri, stoppingToken);

                    _logger.LogInformation("Connected to Control Channel.");
                    retryDelay = 5; // reset backoff on successful connect

                    await RunReceiveLoopAsync(client, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Control Channel error. Reconnecting in {Delay}s...", retryDelay);
                    await Task.Delay(TimeSpan.FromSeconds(retryDelay), stoppingToken);
                    retryDelay = Math.Min(retryDelay * 2, 60); // exponential backoff up to 60 s
                }
            }
        }

        private async Task RunReceiveLoopAsync(ClientWebSocket client, CancellationToken stoppingToken)
        {
            var messageBuffer = new List<byte>();
            var buffer = new byte[1024 * 16];

            while (client.State == WebSocketState.Open && !stoppingToken.IsCancellationRequested)
            {
                using var receiveCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                receiveCts.CancelAfter(ReceiveTimeout);

                WebSocketReceiveResult result;
                try
                {
                    result = await client.ReceiveAsync(new ArraySegment<byte>(buffer), receiveCts.Token);
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                    // ReceiveTimeout fired — connection is silently dead
                    _logger.LogWarning("Control Channel receive timed out ({Timeout}s). Reconnecting...", ReceiveTimeout.TotalSeconds);
                    return;
                }

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("Control Channel closed by server.");
                    try { await client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", stoppingToken); } catch { }
                    return;
                }

                if (result.MessageType == WebSocketMessageType.Binary) continue;

                messageBuffer.AddRange(new ArraySegment<byte>(buffer, 0, result.Count));
                if (!result.EndOfMessage) continue;

                var message = Encoding.UTF8.GetString(messageBuffer.ToArray());
                messageBuffer.Clear();

                _logger.LogInformation("Received control message: {Message}", message);

                var command = JsonConvert.DeserializeObject<dynamic>(message);
                string action = command?.action?.ToString() ?? "";

                switch (action)
                {
                    case "CONNECT_SESSION":
                        string sessionId = command!.sessionId;
                        string dataToken = command!.dataToken;
                        _logger.LogInformation("Starting new data tunnel session: {SessionId}", sessionId);
                        _ = Task.Run(() => _tunnelBridge.StartAsync(sessionId, dataToken, stoppingToken), stoppingToken);
                        break;

                    case "GET_WINDOWS":
                        await HandleGetWindowsAsync(client, command!, stoppingToken);
                        break;

                    case "FOCUS_WINDOW":
                        await HandleFocusWindowAsync(client, command!, stoppingToken);
                        break;

                    case "UPLOAD_FILE":
                        await HandleUploadFileAsync(client, command!, stoppingToken);
                        break;
                }
            }
        }


        private async Task HandleGetWindowsAsync(ClientWebSocket client, dynamic command, CancellationToken ct)
        {
            string requestId = command?.requestId?.ToString() ?? "";
            try
            {
                var windows = WindowManager.GetVisibleWindows();
                var response = JsonConvert.SerializeObject(new
                {
                    action = "WINDOWS_LIST",
                    requestId,
                    windows
                });
                await SendTextAsync(client, response, ct);
                _logger.LogInformation("Sent WINDOWS_LIST: {Count} window(s)", windows.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling GET_WINDOWS");
                // Send error response so server doesn't time out waiting for a reply
                try
                {
                    var errResponse = JsonConvert.SerializeObject(new
                    {
                        action = "WINDOWS_LIST",
                        requestId,
                        windows = new List<object>(),
                        error = ex.Message
                    });
                    await SendTextAsync(client, errResponse, ct);
                }
                catch { }
            }
        }

        private async Task HandleFocusWindowAsync(ClientWebSocket client, dynamic command, CancellationToken ct)
        {
            string requestId = command?.requestId?.ToString() ?? "";
            try
            {
                long hwnd = Convert.ToInt64((object?)command?.hwnd ?? 0L);

                // Optional client-side sizing: clientWidth/Height are the browser canvas pixels,
                // sizePercent scales them to get the desired RDP window size.
                int? clientWidth  = command?.clientWidth  != null ? (int?)Convert.ToInt32((object)command.clientWidth)  : null;
                int? clientHeight = command?.clientHeight != null ? (int?)Convert.ToInt32((object)command.clientHeight) : null;
                int  sizePercent  = command?.sizePercent  != null ? Convert.ToInt32((object)command.sizePercent) : 0;

                int? targetWidth  = null;
                int? targetHeight = null;
                if (clientWidth.HasValue && clientHeight.HasValue && sizePercent > 0)
                {
                    targetWidth  = (int)Math.Round(clientWidth.Value  * sizePercent / 100.0);
                    targetHeight = (int)Math.Round(clientHeight.Value * sizePercent / 100.0);
                }

                var (rect, resizable) = WindowManager.FocusWindow(hwnd, targetWidth, targetHeight);
                var response = JsonConvert.SerializeObject(new
                {
                    action = "FOCUS_RESULT",
                    requestId,
                    success = rect != null,
                    resizable,
                    rect
                });
                await SendTextAsync(client, response, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling FOCUS_WINDOW");
                // Send error response so server doesn't time out waiting for a reply
                try
                {
                    var errResponse = JsonConvert.SerializeObject(new
                    {
                        action = "FOCUS_RESULT",
                        requestId,
                        success = false,
                        resizable = false,
                        rect = (object?)null,
                        error = ex.Message
                    });
                    await SendTextAsync(client, errResponse, ct);
                }
                catch { }
            }
        }

        private async Task HandleUploadFileAsync(ClientWebSocket client, dynamic command, CancellationToken ct)
        {
            string requestId = command?.requestId?.ToString() ?? "";
            try
            {
                string fileName = command?.fileName?.ToString() ?? "upload.bin";
                string data = command?.data?.ToString() ?? "";

                // Sanitize: strip directory traversal
                fileName = Path.GetFileName(fileName);
                if (string.IsNullOrEmpty(fileName)) fileName = "upload.bin";

                // Target: %USERPROFILE%\Desktop\Shared\
                string sharedDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Desktop", "Shared");
                Directory.CreateDirectory(sharedDir);

                string destPath = Path.Combine(sharedDir, fileName);
                byte[] bytes = Convert.FromBase64String(data);
                await File.WriteAllBytesAsync(destPath, bytes, ct);

                _logger.LogInformation("Uploaded file: {Path} ({Bytes} bytes)", destPath, bytes.Length);

                var response = JsonConvert.SerializeObject(new
                {
                    action = "UPLOAD_RESULT",
                    requestId,
                    path = destPath
                });
                await SendTextAsync(client, response, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling UPLOAD_FILE");
                try
                {
                    var errResponse = JsonConvert.SerializeObject(new
                    {
                        action = "UPLOAD_RESULT",
                        requestId,
                        error = ex.Message
                    });
                    await SendTextAsync(client, errResponse, ct);
                }
                catch { }
            }
        }

        private static async Task SendTextAsync(ClientWebSocket client, string text, CancellationToken ct)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            await client.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, ct);
        }
    }
}
