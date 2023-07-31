require("dotenv").config();
const logger = require("../logger")

async function getIdScenarioFromName(client, name) {
    try {
        const database = client.db("etag");
        const scenari = database.collection("scenari");
        let query = {
            name: name
        };
        let scen = await scenari.find(query).toArray()
        return scen[0].scenarioId
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

module.exports = {
    getIdScenarioFromName: getIdScenarioFromName,
}