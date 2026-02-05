const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const API_URL = "https://2cc8fdff-58f5-4de4-ba18-23c3c389e63d-00-10zd3s5b89sgn.janeway.replit.dev/api/match/info";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Ustaw sędziów i wykluczonych zawodników")
    .addStringOption(o => o.setName("liga").setDescription("Wybierz ligę").setRequired(true).addChoices(
      { name: "Ekstraklasa", value: "ekstraklasa" },
      { name: "Mecze Towarzyskie 25/26 PFF", value: "turniej" }
    ))
    .addStringOption(o => o.setName("uuid").setDescription("UUID meczu (Ekstraklasa) lub UUID fixture (Turniej np. tf-jag-wis-0602)").setRequired(true))
    .addStringOption(o => o.setName("glowny").setDescription("Sędzia główny").setRequired(false))
    .addStringOption(o => o.setName("asystent1").setDescription("Asystent 1 (liniowy)").setRequired(false))
    .addStringOption(o => o.setName("asystent2").setDescription("Asystent 2 (liniowy)").setRequired(false))
    .addStringOption(o => o.setName("techniczny").setDescription("Sędzia techniczny (4. sędzia)").setRequired(false))
    .addStringOption(o => o.setName("var").setDescription("Sędzia VAR").setRequired(false))
    .addStringOption(o => o.setName("avar").setDescription("Asystent VAR (AVAR)").setRequired(false))
    .addStringOption(o => o.setName("wykluczeni").setDescription("Format: Nick:Powód, Nick2:Powód2").setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const liga = interaction.options.getString("liga");
    const inputUuid = interaction.options.getString("uuid");
    const main = interaction.options.getString("glowny");
    const assistant1 = interaction.options.getString("asystent1");
    const assistant2 = interaction.options.getString("asystent2");
    const fourth = interaction.options.getString("techniczny");
    const varRef = interaction.options.getString("var");
    const avar = interaction.options.getString("avar");
    const excludedRaw = interaction.options.getString("wykluczeni");

    let uuid = inputUuid;
    let fixtureInfo = null;

    if (liga === "turniej") {
      try {
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

        fixtureInfo = fixture;
        
        if (fixture.matchUuid) {
          uuid = fixture.matchUuid;
        } else {
          uuid = null;
        }
      } catch (err) {
        console.error("Error fetching tournament:", err);
        return await interaction.editReply(`❌ Błąd pobierania turnieju: ${err.message}`);
      }
    }

    const referees = {};
    if (main) referees.main = main;
    if (assistant1) referees.assistant1 = assistant1;
    if (assistant2) referees.assistant2 = assistant2;
    if (fourth) referees.fourth = fourth;
    if (varRef) referees.var = varRef;
    if (avar) referees.avar = avar;

    let excludedPlayers = [];
    if (excludedRaw) {
      excludedPlayers = excludedRaw.split(",").map(item => {
        const parts = item.trim().split(":");
        return {
          name: parts[0]?.trim() || "",
          reason: parts[1]?.trim() || "Brak powodu"
        };
      }).filter(p => p.name);
    }

    try {
      if (liga === "turniej" && fixtureInfo) {
        await axios.post("https://2cc8fdff-58f5-4de4-ba18-23c3c389e63d-00-10zd3s5b89sgn.janeway.replit.dev/api/tournament/fixture/info", {
          fixtureUuid: fixtureInfo.uuid,
          tournamentId: 1,
          referees,
          excludedPlayers
        });
      }

      if (uuid) {
        await axios.post(API_URL, { uuid, referees, excludedPlayers });
      }

      const ligaName = liga === "turniej" ? "🏆 Mecze Towarzyskie" : "⚽ Ekstraklasa";
      let response = `✅ **Informacje zapisane!**\n${ligaName}\n\n`;
      
      if (fixtureInfo) {
        response += `📋 Fixture: ${fixtureInfo.teamA} vs ${fixtureInfo.teamB}\n`;
        response += `📅 Kolejka: ${fixtureInfo.matchday || "?"}\n\n`;
      }
      
      if (Object.keys(referees).length > 0) {
        response += "⚽ **Sędziowie:**\n";
        if (referees.main) response += `  🎯 Główny: ${referees.main}\n`;
        if (referees.assistant1) response += `  🚩 Asystent 1: ${referees.assistant1}\n`;
        if (referees.assistant2) response += `  🚩 Asystent 2: ${referees.assistant2}\n`;
        if (referees.fourth) response += `  4️⃣ Techniczny: ${referees.fourth}\n`;
        if (referees.var) response += `  📺 VAR: ${referees.var}\n`;
        if (referees.avar) response += `  📺 AVAR: ${referees.avar}\n`;
      }

      if (excludedPlayers.length > 0) {
        response += "\n❌ **Wykluczeni:**\n";
        excludedPlayers.forEach(p => {
          response += `  • ${p.name} - ${p.reason}\n`;
        });
      }

      await interaction.editReply(response);
    } catch (err) {
      console.error("Error in info command:", err);
      await interaction.editReply(`❌ Błąd: ${err.message}`);
    }
  }
};
