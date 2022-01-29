using Discord;
using Discord.WebSocket;
using dotenv.net;

public class Program
{
    private DiscordSocketClient _client;
    private static List<string> _obligatoryEnvItems = new()
    {
        "TOKEN",
        "GUILD_ID",
        "CLIENT_ID"
    };

    private Task Log(LogMessage msg)
    {
        Console.WriteLine(msg.ToString());
        return Task.CompletedTask;
    }

    public static Task Main(string[] args) => new Program().MainAsync();

    public Program()
    {
        _client = new DiscordSocketClient();
    }

    public async Task MainAsync()
    {
        Console.WriteLine("Hello, World!");

        _client.Log += Log;

        // DotEnv.Load();
        var envVars = DotEnv.Read(new DotEnvOptions(overwriteExistingVars: true, probeForEnv: true, probeLevelsToSearch: 6));
        // Console.WriteLine(envVars); // would print out whatever value was associated with the 'KEY'

        if (envVars == null)
        {
            Console.WriteLine("The bot needs config data to startup. Please locate the \".env-sample\" file, duplicate it, populate it and rename it to \".env\".");
            return;
        }

        foreach (var itemName in _obligatoryEnvItems)
        {
            var key = itemName.ToUpperInvariant();
            if (!envVars.ContainsKey(key))
            {
                Console.WriteLine($"The provided \".env\" file does not contain the mandatory item \"{key}\". Aborting...");
                return;
            }
        }

        //  You can assign your bot token to a string, and pass that in to connect.
        //  This is, however, insecure, particularly if you plan to have your code hosted in a public repository.
        var token = envVars["TOKEN"];

        // Some alternative options would be to keep your token in an Environment Variable or a standalone file.
        // var token = Environment.GetEnvironmentVariable("NameOfYourEnvironmentVariable");
        // var token = File.ReadAllText("token.txt");
        // var token = JsonConvert.DeserializeObject<AConfigurationClass>(File.ReadAllText("config.json")).Token;

        try
        {
            await _client.LoginAsync(TokenType.Bot, token);
            await _client.StartAsync();
        }
        catch (Exception)
        {
            await _client.StopAsync();
        }

        // Block this task until the program is closed.
        await Task.Delay(-1);
    }

}