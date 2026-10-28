namespace RdpHostAgent;

public class AgentConfig
{
    public string ProxyControlUrl { get; set; } = string.Empty;
    public string ProxyDataUrl { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public string SecretToken { get; set; } = string.Empty;
    public string PasscodeHash { get; set; } = string.Empty;
}
