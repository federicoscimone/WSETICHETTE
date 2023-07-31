require("dotenv").config();
const dbUtenti = "utility"

let { ObjectId, MongoClient } = require('mongodb');
const logger = require("../logger")


// aggiorna notifiche
async function addNotifica(client, mittente, destinatario, testo, tipo, rifId) {
    try {
        const now = new Date()
        const notifiche = client.db(dbUtenti).collection("notifiche");
        let toDb = {
            nomeUtente: destinatario,
            mittente: mittente,
            testo: testo,
            tipo: tipo,
            rifId: rifId,
            data: now
        }

        const result = await notifiche.insertOne(toDb)
        return result
    } catch (err) {
        return err;
    }
}

async function deleteNotifica(client, id) {
    try {
        const notifiche = client.db(dbUtenti).collection("notifiche");
        let toDb = {
            _id: new ObjectId(id)
        }
        const result = await notifiche.deleteOne(toDb)
        return result
    } catch (err) {
        console.log(err)
        return err;
    }
}

async function getNotifiche(client, utente) {
    try {
        const notifiche = client.db(dbUtenti).collection("notifiche");
        let query = {
            nomeUtente: utente,

        }
        const result = await notifiche.find(query).toArray()
        return result
    } catch (err) {
        return err;
    }
}

async function getUtentiUsername(client, x) {
    try {
        const database = client.db(dbUtenti);
        const utenti = database.collection("utenti");
        let query = {
            $or: [{ role: "tl" }, { role: "adc" }]
        };
        let users = await utenti.find(query).project({ nomeUtente: 1, _id: 0 }).toArray()
        return users
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

// ottieni il numero di chiamate totali per numero
async function getNomeFromInt(client, x) {
    try {
        const database = client.db(dbUtenti);
        const utenti = database.collection("utenti");
        let query = {
            interno: parseInt(x)
        };
        let utente = await utenti.find(query).toArray()
        return utente[0].nomeUtente
    } catch (err) {
        logger.error("ERRORE getNomeFromInt: " + err)
        return err;
    }
}

// cerca per nome utente
async function findByUsername(client, username) {
    try {
        const database = client.db(dbUtenti);
        const utenti = database.collection("utenti");
        let query = {
            username: username
        };
        let utente = await utenti.findOne(query)

        return utente
    } catch (err) {
        console.log(err)
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function findById(client, id) {
    try {
        const database = client.db(dbUtenti);
        const utenti = database.collection("utenti");
        let query = {
            _id: ObjectId(id)
        };
        let utente = await utenti.findOne(query)
        return utente
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}



// aggiorna last login
async function updateLastLogin(client, utente) {
    try {
        const utenti = client.db(dbUtenti).collection("utenti");
        let query = { username: utente.username }
        utenti.updateOne(query, { $set: { lastLogin: new Date() } }, (err, res) => {
            if (err) throw err;
            console.log(res)

            return res
        })

    } catch (err) {
        return err;
    }
}

// aggiorna last login
async function createUser(client, utente) {
    try {
        //   nuova.data = new Date()
        let toDb = {
            username: utente.username,
            lastLogin: new Date(),
            role: utente.role,
            pv: utente.pv.nome
        }
        const utenti = client.db(dbUtenti).collection("utenti");
        const result = await utenti.insertOne(toDb)
        return result
    } catch (err) {
        console.log(err)
        return err;
    }
}



module.exports = {
    findByUsername: findByUsername,
    findById: findById,
    getUtentiUsername: getUtentiUsername,
    updateLastLogin: updateLastLogin,
    createUser: createUser,
    addNotifica: addNotifica,
    getNotifiche: getNotifiche,
    deleteNotifica: deleteNotifica
}