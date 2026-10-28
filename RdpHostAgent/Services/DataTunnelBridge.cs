using System.Net.Sockets;
using System.Net.WebSockets;
using Microsoft.Extensions.Options;

namespace RdpHostAgent.Services;

public class DataTunnelBridge
{
    private readonly ILogger<DataTunnelBridge> _logger;
    private readonly AgentConfig _config;
    private long _rdpToTunnelBytes;
    private long _tunnelToRdpBytes;

    public DataTunnelBridge(ILogger<DataTunnelBridge> logger, IOptions<AgentConfig> config)
    {
        _logger = logger;
        _config = config.Value;
    }

    public async Task StartAsync(string sessionId, string dataToken, CancellationToken stoppingToken)
    {
        Interlocked.Exchange(ref _rdpToTunnelBytes, 0);
        Interlocked.Exchange(ref _tunnelToRdpBytes, 0);

        using var tcpClient = new TcpClient();
        using var webSocket = new ClientWebSocket();
        webSocket.Options.DangerousDeflateOptions = new WebSocketDeflateOptions
        {
            ClientContextTakeover = false,
            ServerContextTakeover = false
        };

        try
        {
            _logger.LogInformation("[Session {SessionId}] Connecting to local RDP (3389)...", sessionId);
            await tcpClient.ConnectAsync("127.0.0.1", 3389, stoppingToken);
            using var tcpStream = tcpClient.GetStream();
            _logger.LogInformation("[Session {SessionId}] Connected to RDP.", sessionId);

            _logger.LogInformation("[Session {SessionId}] Connecting to Proxy Data Channel...", sessionId);
            Uri dataUri = new Uri($"{_config.ProxyDataUrl}?token={dataToken}");
            await webSocket.ConnectAsync(dataUri, stoppingToken);
            _logger.LogInformation("[Session {SessionId}] Connected to Proxy Data Channel.", sessionId);

            var tunnelToRdp = PipeWebSocketToTcp(webSocket, tcpStream, stoppingToken);
            var rdpToTunnel = PipeTcpToWebSocket(tcpStream, webSocket, stoppingToken);
            _ = LogStatsAsync(sessionId, stoppingToken);

            await Task.WhenAny(tunnelToRdp, rdpToTunnel);
            _logger.LogInformation(
                "[Session {SessionId}] Session ended. Final stats: RDP->Tunnel={RdpToTunnelBytes} bytes, Tunnel->RDP={TunnelToRdpBytes} bytes.",
                sessionId,
                Interlocked.Read(ref _rdpToTunnelBytes),
                Interlocked.Read(ref _tunnelToRdpBytes));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Session {SessionId}] Error in Data Tunnel.", sessionId);
        }
        finally
        {
            if (webSocket.State == WebSocketState.Open)
                await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Tunnel Closed", CancellationToken.None);
            tcpClient.Close();
        }
    }

    private async Task PipeWebSocketToTcp(ClientWebSocket webSocket, NetworkStream tcpStream, CancellationToken stoppingToken)
    {
        var buffer = new byte[65536];
        try
        {
            while (webSocket.State == WebSocketState.Open && !stoppingToken.IsCancellationRequested)
            {
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), stoppingToken);
                if (result.MessageType == WebSocketMessageType.Close) break;
                
                if (result.Count > 0)
                {
                    Interlocked.Add(ref _tunnelToRdpBytes, result.Count);
                    await tcpStream.WriteAsync(buffer.AsMemory(0, result.Count), stoppingToken);
                    await tcpStream.FlushAsync(stoppingToken);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "PipeWebSocketToTcp interrupted.");
        }
    }

    private async Task PipeTcpToWebSocket(NetworkStream tcpStream, ClientWebSocket webSocket, CancellationToken stoppingToken)
    {
        var buffer = new byte[65536];
        try
        {
            while (webSocket.State == WebSocketState.Open && !stoppingToken.IsCancellationRequested)
            {
                int bytesRead = await tcpStream.ReadAsync(buffer.AsMemory(0, buffer.Length), stoppingToken);
                if (bytesRead == 0) break;
                Interlocked.Add(ref _rdpToTunnelBytes, bytesRead);

                await webSocket.SendAsync(
                    buffer.AsMemory(0, bytesRead),
                    WebSocketMessageType.Binary,
                    WebSocketMessageFlags.EndOfMessage | WebSocketMessageFlags.DisableCompression,
                    stoppingToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "PipeTcpToWebSocket interrupted.");
        }
    }

    private async Task LogStatsAsync(string sessionId, CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                _logger.LogInformation(
                    "[Session {SessionId}] Tunnel stats: RDP->Tunnel={RdpToTunnelBytes} bytes, Tunnel->RDP={TunnelToRdpBytes} bytes.",
                    sessionId,
                    Interlocked.Read(ref _rdpToTunnelBytes),
                    Interlocked.Read(ref _tunnelToRdpBytes));
            }
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown.
        }
    }
}
