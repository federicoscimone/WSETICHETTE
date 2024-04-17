require("dotenv").config();
const dbUtenti = "etag"
const logger = require("../logger").default


// aggiunge evento
async function addEvent(client, dati) {
    try {
        const now = new Date()
        const event = client.db(dbUtenti).collection("eventi");
        let toDb = dati
        toDb.data = now
        const result = await event.insertOne(toDb)
        return result
    } catch (err) {
        return err;
    }
}


// recupera ultimi X eventi
async function getEvent(client, user) {
    try {
        const event = client.db(dbUtenti).collection("eventi");
        const result = await event.find({ utente: { $in: [user, "system"] } }).sort({ data: -1 }).limit(10).toArray()
        return result
    } catch (err) {
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


// aggiorna last login
async function updateLastLogin(client, utente) {
    try {
        const utenti = client.db(dbUtenti).collection("utenti");
        let query = { username: utente.username }
        utenti.updateOne(query, { $set: { lastLogin: new Date() } }, (err, res) => {
            if (err) throw err;
            //   console.log(res)

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
    updateLastLogin: updateLastLogin,
    createUser: createUser,
    addEvent: addEvent,
    getEvent: getEvent
}