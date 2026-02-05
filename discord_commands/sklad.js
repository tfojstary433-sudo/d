const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const API_URL = "https://2cc8fdff-58f5-4de4-ba18-23c3c389e63d-00-10zd3s5b89sgn.janeway.replit.dev/api/match/lineup";

async function fetchRobloxIds(usernames) {
  try {
    const res = await axios.post("https://users.roblox.com/v1/usernames/users", {
      usernames,
      excludeBannedUsers: true
    });
    const map = {};
    res.data.data.forEach(u => {
      map[u.name.toLowerCase()] = u.id;
    });
    return map;
  } catch (e) {
    console.error("Błąd pobierania ID Roblox:", e);
    return {};
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sklad")
    .setDescription("Ustaw skład z numerami i pozycjami (Format: Nick:Numer:Pozycja)")
    .addStringOption(o => o.setName("liga").setDescription("Wybierz ligę").setRequired(true).addChoices(
      { name: "Ekstraklasa", value: "ekstraklasa" },
      { name: "Mecze Towarzyskie 25/26 PFF", value: "turniej" }
    ))
    .addStringOption(o => o.setName("uuid").setDescription("UUID meczu (Ekstraklasa) lub UUID fixture (Turniej np. tf-jag-wis-0602)").setRequired(true))
    .addStringOption(o => o.setName("druzyna").setDescription("Drużyna").setRequired(true).addChoices(
      { name: "Gospodarze (A)", value: "A" },
      { name: "Goście (B)", value: "B" }
    ))
    .addStringOption(o => o.setName("zawodnicy").setDescription("Przykład: Gracz1:1:GK, Gracz2:7:DEF | Rezerwa1:12:FW").setRequired(true))
    .addStringOption(o => o.setName("formacja").setDescription("Np. 4-4-2").setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const liga = interaction.options.getString("liga");
    const inputUuid = interaction.options.getString("uuid");
    const team = interaction.options.getString("druzyna");
    const formation = interaction.options.getString("formacja") || "4-4-2";
    const raw = interaction.options.getString("zawodnicy");

    console.log("=== SKLAD DEBUG ===");
    console.log("Liga:", liga);
    console.log("Input UUID:", inputUuid);
    console.log("Raw input:", raw);

    let uuid = inputUuid;

    if (liga === "turniej") {
      try {
        // Pobierz turniej i znajdź fixture
        const tournamentRes = await axios.get("https://2cc8fdff-58f5-4de4-ba18-23c3c389e63d-00-10zd3s5b89sgn.janeway.replit.dev/api/tournament/1");
        const tournament = tournamentRes.data;
        
        const fixture = tournament.fixtures?.find(f => 
          f.uuid === inputUuid || 
          f.matchUuid === inputUuid ||
          f.id === parseInt(inputUuid)
        );

        if (!fixture) {
          return await interaction.editReply(`❌ Nie znaleziono fixture o UUID: ${inputUuid}\n📋 Dostępne UUID: ${tournament.fixtures?.slice(0, 5).map(f => f.uuid).join(", ")}...`);
        }

        if (fixture.matchUuid) {
          // Mecz już wystartowany - użyj matchUuid
          uuid = fixture.matchUuid;
          console.log("Found existing matchUuid:", uuid);
        } else {
          // Mecz nie wystartowany - poinformuj że sędzia musi wystartować z Robloxa
          return await interaction.editReply(
            `⏳ **Mecz "${fixture.teamA} vs ${fixture.teamB}" czeka na rozpoczęcie**\n\n` +
            `📋 Fixture UUID: \`${fixture.uuid}\`\n` +
            `📅 Kolejka: ${fixture.matchday || "?"}\n\n` +
            `💡 Sędzia musi użyć komendy w Roblox:\n` +
            `\`\`\`:startmatch ${fixture.teamA.substring(0, 3).toUpperCase()} ${fixture.teamB.substring(0, 3).toUpperCase()}\`\`\`\n` +
            `Po rozpoczęciu meczu przez sędziego, skład zostanie automatycznie przypisany.`
          );
        }
      } catch (err) {
        console.error("Error fetching tournament:", err);
        return await interaction.editReply(`❌ Błąd pobierania turnieju: ${err.message}`);
      }
    }

    const [startersRaw, benchRaw] = raw.split("|");

    const parsePlayers = (text) => {
      if (!text) return [];
      return text.split(",").map(item => {
        const trimmed = item.trim();
        const parts = trimmed.split(":");
        
        const name = parts[0]?.trim();
        const number = parts[1] ? parseInt(parts[1].trim()) : null;
        const position = parts[2]?.trim().toUpperCase() || "";
        
        console.log(`Parsing: "${trimmed}" -> name="${name}", number=${number}, position="${position}"`);
        
        if (!name) {
          console.warn(`Skipped empty name: "${trimmed}"`);
          return null;
        }
        
        return { name, number, position };
      }).filter(p => p !== null);
    };

    const startersData = parsePlayers(startersRaw);
    const benchData = parsePlayers(benchRaw);

    console.log("Starters parsed:", JSON.stringify(startersData, null, 2));
    console.log("Bench parsed:", JSON.stringify(benchData, null, 2));

    const allNames = [...startersData, ...benchData].map(p => p.name);

    try {
      const idMap = await fetchRobloxIds(allNames);

      const mapWithIds = (players) => players.map(p => {
        const id = idMap[p.name.toLowerCase()];
        if (!id) throw new Error(`Nie znaleziono gracza Roblox: ${p.name}`);
        return { 
          id,
          name: p.name, 
          number: p.number, 
          position: p.position 
        };
      });

      const starters = mapWithIds(startersData);
      const bench = mapWithIds(benchData);

      console.log("Sending to backend:", JSON.stringify({ uuid, team, formation, starters, bench }, null, 2));

      await axios.post(API_URL, { uuid, team, formation, starters, bench });

      const ligaName = liga === "turniej" ? "🏆 Mecze Towarzyskie" : "⚽ Ekstraklasa";
      const formatPlayers = (players) => players.map(p => {
        const parts = [];
        if (p.number) parts.push(`#${p.number}`);
        parts.push(p.name);
        if (p.position) parts.push(`(${p.position})`);
        return parts.join(' ');
      }).join(', ');

      await interaction.editReply(
        `✅ Skład zapisany!\n${ligaName}\n📋 Formacja: ${formation}\n` +
        `👥 Podstawa: ${formatPlayers(starters)}\n` +
        `🪑 Ławka: ${formatPlayers(bench)}`
      );
    } catch (err) {
      console.error("Error in sklad command:", err);
      await interaction.editReply(`❌ Błąd: ${err.message}`);
    }
  }
};
