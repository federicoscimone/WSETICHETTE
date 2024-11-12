require("dotenv").config();
const logger = require("../logger")

async function getIdScenarioFromName(client, name, orientamento) {
    try {
        const database = client.db("etag");
        const scenari = database.collection("scenari");
        let query = {
            name: name,
            orientation: orientamento
        };
        let scen = await scenari.find(query).toArray()
        if (scen[0].scenarioId)
            return scen[0].scenarioId
        else
            return { error: "scenario non trovato" }
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function getTagFromScenarioId(client, id) {
    try {
        const database = client.db("etag");
        const scenari = database.collection("scenari");
        let query = {
            scenarioId: id,
        };
        let scen = await scenari.find(query).toArray()
        if (scen[0].scenarioId)
            if (scen[0].tag)
                return scen[0].tag
            else return []
        else
            return { error: "scenario non trovato" }
    } catch (err) {
        console.log(err)
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function getScenariosName(client) {
    try {
        const database = client.db("etag");
        const scenari = database.collection("scenari");

        let scen = await scenari.find().sort({ "position": 1 }).toArray()

        return scen
    } catch (err) {
        console.log(err)
        logger.error("ERRORE: " + err)
        return err;
    }
}

module.exports = {
    getIdScenarioFromName: getIdScenarioFromName,
    getScenariosName: getScenariosName,
    getTagFromScenarioId: getTagFromScenarioId
}