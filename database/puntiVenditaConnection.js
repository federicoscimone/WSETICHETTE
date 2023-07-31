require("dotenv").config();
const logger = require("../logger")
async function getPuntiVendita(client) {
    try {
        const database = client.db("utility");
        const puntiVendita = database.collection("puntiVendita");
        let query = {
        };
        let pv = await puntiVendita.find(query).toArray()
        return pv
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function getPuntiVenditaWord(client, word) {
    try {
        const regexWord = new RegExp('' + word, 'i'); //regular expression: contiene word 'i'=case insensitive
        const database = client.db("utility");
        const puntiVendita = database.collection("puntiVendita");
        let query = {
            $or: [
                {
                    nome: { $regex: regexWord }
                },
                {
                    direttore: { $regex: regexWord }
                },
                {
                    note: { $regex: regexWord }
                },
                {
                    indirizzo: { $regex: regexWord }
                }
            ]
        };
        let pv = await puntiVendita.find(query).toArray()
        return pv
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function getNomeDaSigla(client, sigla) {
    try {
        const database = client.db("utility");
        const puntiVendita = database.collection("puntiVendita");
        let query = {
            sigla: sigla
        };
        let pv = await puntiVendita.find(query).toArray()
        return pv[0].nome
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function updatePuntoVendita(client, id, pv) {
    try {

        const puntiVendita = client.db("utility").collection("puntiVendita");
        let query = { sigla: id }
        delete pv._id // elimina il campo _id dall'oggetto per evitare errore in quando è un parametro immutabile
        puntiVendita.updateOne(query, { $set: { ...pv } }, (err, res) => {
            if (err) throw err;
            logger.error(res)
            return res
        })
    } catch (err) {
        return err;
    }
}

async function getSesId(client, sigla) {
    try {
        const database = client.db("utility");
        const puntiVendita = database.collection("puntiVendita");
        const filter = {
            'sigla': sigla
        }
        const projection = {
            'idVusion': 1
        }
        let id = await puntiVendita.find(filter, { projection }).toArray()
        if (id[0])
            return id[0].idVusion
        else
            return { error: "id ses non trovato" }
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

module.exports = {
    getPuntiVendita: getPuntiVendita,
    getNomeDaSigla: getNomeDaSigla,
    getPuntiVenditaWord: getPuntiVenditaWord,
    updatePuntoVendita: updatePuntoVendita,
    getSesId: getSesId
}