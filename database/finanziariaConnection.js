require("dotenv").config()
const mongoDbUrl = process.env.MONGODBURL
const { ObjectId, MongoClient } = require("mongodb");
const logger = require("../logger")
const dbFinanz = "etag"
const collFinanz = 'finanziarie'

const mongoClient = new MongoClient(mongoDbUrl)

async function getDatiFinanziaria(prezzo, pv, finanziaria) {
    try {
        let now = new Date()


        let finData = { nrate: 0, rata: 0, tan: 0, taeg: 0, proroga: "0", spese: 0 }

        if (prezzo < 1000 && pv === 'LC') {

            finanziaria = 'Tan 0 Taeg 0'
        }
        else {
            finanziaria = 'Tan 0 Taeg Variabile'
        }


        if (now > new Date('2023-09-26')) finanziaria = 'Tan 0 Taeg 0'
        if (now > new Date('2023-10-12')) {
            if ((pv === 'MN') || (pv === 'LC') || (pv === 'TV')) finanziaria = 'Tan 0 Taeg 0'
            else finanziaria = 'Tan 0 Taeg Variabile'
        }


        if (pv === 'PR') finanziaria = 'Tan 0 Taeg Variabile'

        //  console.log(finanziaria)

        //finanziaria tan e taeg zero
        if (finanziaria === 'Tan 0 Taeg 0') {
            finData.tan = 0
            finData.taeg = 0
            finData.proroga = "dopo 30 giorni"
            if (prezzo > 398 && prezzo < 1000) {
                finData.nrate = 10
                finData.rata = prezzo / finData.nrate
            } else
                if (prezzo >= 1000 && prezzo < 5000) {
                    finData.nrate = 10
                    finData.rata = prezzo / finData.nrate
                }
                else {
                    finData.error = "Importo da finanziare fuori range"
                }
        } else {

            //finanziaria tan 0
            if (finanziaria === 'Tan 0 Taeg Variabile') {
                finData.tan = 0
                finData.proroga = "FEBBRAIO 2024"

                if (prezzo > 298.99 && prezzo <= 1499.99) {
                    finData.nrate = 20
                    finData.taeg = 10.72
                    finData.spese = ((prezzo * 0.6) / 100) * finData.nrate
                    finData.rata = (finData.spese + prezzo) / finData.nrate
                } else
                    if (prezzo >= 1500 && prezzo <= 2499.99) {
                        finData.nrate = 30
                        finData.taeg = 11.56
                        finData.spese = ((prezzo * 0.6) / 100) * finData.nrate
                        finData.rata = (finData.spese + prezzo) / finData.nrate
                    } /*else
                        if (prezzo >= 2500 && prezzo <= 5000.99) {
                            finData.nrate = 32
                            finData.taeg = 12.84
                            finData.spese = ((prezzo * 0.7) / 100) * finData.nrate
                            finData.rata = (finData.spese + prezzo) / finData.nrate
                        }*/ else { finData.error = "Importo da finanziare fuori range" }

            } else {
                if (finanziaria === 'Rata chiara') {
                    finData.proroga = "dopo 3 mesi"
                    if (prezzo < 999.99) {
                        finData.nrate = 222499
                        finData.taeg = 11.12
                        finData.tan = 10.60
                        finData.spese = prezzo * 0.0011
                        finData.rata = (prezzo / (finData.nrate - 2)) + finData.spese
                    } else {
                        finData.nrate = 33
                        finData.taeg = 9.39
                        finData.tan = 9.00
                        finData.spese = prezzo * 0.00152
                        finData.rata = (prezzo / (finData.nrate - 3)) + finData.spese
                    }
                }

                else {
                    //test per luigi
                    if (finanziaria === 'Rata luigi') {
                        finData.proroga = "dopo 3 secoli"
                        if (prezzo < 999.99) {
                            finData.nrate = 3
                            finData.taeg = 11.12
                            finData.tan = 10.60
                            finData.spese = prezzo * 0.0011
                            finData.rata = (prezzo / (finData.nrate - 2)) + finData.spese
                        }
                        else {
                            if (prezzo >= 1500 && prezzo <= 2499.99) {
                                finData.nrate = 26
                                finData.taeg = 12.35
                                finData.spese = ((prezzo * 0.7) / 100) * finData.nrate
                                finData.rata = (finData.spese + prezzo) / finData.nrate
                            } else {
                                finData.nrate = 45
                                finData.taeg = 9.39
                                finData.tan = 9.00
                                finData.spese = prezzo * 0.00152
                                finData.rata = (prezzo / (finData.nrate - 3)) + finData.spese
                            }
                        }

                    }
                    else {
                        finData.error = "Finanziaria non trovata"
                    }
                }

            }
        }

        if (!finData.error) {
            finData.rata = finData.rata.toFixed(2)
            finData.spese = finData.spese.toFixed(2)
            finData.tan = finData.tan.toFixed(2)
            finData.taeg = finData.taeg.toFixed(2)
        }
        return finData
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

async function getDatiFinanziariaDinamic(importo, pv) {
    try {
        let finData = {}
        let error = ''
        let finanziarie = await getCurrentFin(mongoClient, pv) // ottieni tutte le finaziarie attive per la data odierna e il pv indicato

        if (finanziarie.length > 0) { // se trovo almeno una finanziaria attiva
            for (let i = 0; i < finanziarie.length; i++) { // per ogni finanziaria cerco la regola corrispondente e ne restituisco la prima che trovo
                let finanziaria = finanziarie[i]

                let regola = finanziaria.regole.find(r => {
                    return importo >= r.rangeInizio && importo <= r.rangeFine
                })

                if (regola) {
                    let spese = 0
                    let rata = 0
                    spese = (((importo * regola.spesaPercentuale) / 100) + regola.spesaEuro) * regola.nRate
                    rata = (spese + importo) / regola.nRate

                    // compongo il dato finanziario da mostrare nel prezzo
                    finData.nrate = regola.nRate
                    finData.taeg = regola.taeg.toFixed(2)
                    finData.tan = regola.tan.toFixed(2)
                    finData.spese = spese.toFixed(2)
                    finData.rata = rata.toFixed(2)
                    finData.proroga = finanziaria.proroga
                    finData.nome = finanziaria.nome

                    return finData
                } else { // se trovo finanziare ma non trovo regole adatte salvo l'errore
                    error = "Importo non finanziabile"
                }
            }
        } else { // se non trovo finanziare salvo l'errore
            error = "Nessuna finanziaria attiva oggi per il pv e indicato"
        }

        // se non sono disponibili la rata e il nome della finanziata passo l'errore salvato sulla variabile error
        if (!finData.rata && !finData.nome)
            finData = { error: error }
        return finData
    } catch (error) {
        console.log(error)
    }
}

//recupera le finanziare correnti per data
async function getCurrentFin(client, pv) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        const query = {
            abilitato: true,
            dataInizio: { $lte: new Date() },
            dataFine: { $gte: new Date() },
            puntiVendita: { $in: [pv] }
        }
        const result = await finanz.find(query).sort({ _id: -1 }).toArray()

        return result
    } catch (err) {
        console.log(err)
        return err;
    }
}

// recupera ultimi X eventi
async function getFinanziarie(client) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        const result = await finanz.find().sort({ dataUltimaModifica: -1 }).toArray()
        return result
    } catch (err) {
        console.log(err)
        return err;
    }
}



async function switchFinanziaria(client, id, user) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        let query = { _id: ObjectId(id) }
        let res = await finanz.updateOne(query, [{
            $set: {
                abilitato: { $not: "$abilitato" },
                dataUltimaModifica: new Date(),
                utenteUltimaModifica: user,
            }
        }])

        return res

    } catch (err) {
        console.log(err)
        return err;
    }
}

async function setFinanziaria(client, id, finanziara, user) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        finanziara.utenteUltimaModifica = user
        finanziara.dataUltimaModifica = new Date()
        finanziara.importoMinimo = parseInt(finanziara.importoMinimo)
        finanziara.importoMassimo = parseInt(finanziara.importoMassimo)
        const dataInizio = new Date(finanziara.dataInizio)
        dataInizio.setHours(2);
        dataInizio.setMinutes(0);
        finanziara.dataInizio = dataInizio

        const dataFine = new Date(finanziara.dataFine)
        dataFine.setHours(23);
        dataFine.setMinutes(0);
        finanziara.dataFine = dataFine

        delete finanziara.dataCreazione
        let query = { _id: ObjectId(id) }

        delete finanziara._id // elimina il campo _id dall'oggetto per evitare errore in quando è un parametro immutabile

        let res = await finanz.updateOne(query, { $set: { ...finanziara } })

        return res

    } catch (err) {
        console.log(err)
        return err;
    }
}

async function deleteFinanziaria(client, id) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        let query = { _id: ObjectId(id) }
        let res = await finanz.deleteOne(query)
        return res
    } catch (err) {
        console.log(err)
        return err;
    }
}


async function postFinanziaria(client, finanziara, user) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        finanziara.utenteCreazione = user
        finanziara.dataCreazione = new Date()
        finanziara.importoMinimo = parseInt(finanziara.importoMinimo)
        finanziara.importoMassimo = parseInt(finanziara.importoMassimo)
        const dataInizio = new Date(finanziara.dataInizio)
        dataInizio.setHours(2);
        dataInizio.setMinutes(0);
        finanziara.dataInizio = dataInizio

        const dataFine = new Date(finanziara.dataFine)
        dataFine.setHours(23);
        dataFine.setMinutes(0);
        finanziara.dataFine = dataFine
        delete finanziara.dataUltimaModifica
        delete finanziara.utenteUltimaModifica
        delete finanziara._id

        if (!finanziara.regole) finanziara.regole = []

        let res = await finanz.insertOne(finanziara)

        return res

    } catch (err) {
        console.log(err)
        return err;
    }
}


async function postRegola(client, id, regola, user) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        regola.rangeInizio = parseFloat(regola.rangeInizio)
        regola.rangeFine = parseFloat(regola.rangeFine)
        regola.tan = parseFloat(regola.tan)
        regola.taeg = parseFloat(regola.taeg)
        regola.spesaPercentuale = parseFloat(regola.spesaPercentuale)
        regola.spesaEuro = parseFloat(regola.spesaEuro)
        regola.nRate = parseInt(regola.nRate)
        let query = { _id: ObjectId(id) }

        let res = await finanz.updateOne(query,
            {
                $push: { regole: regola },
                $set: { utenteUltimaModifica: user, dataUltimaModifica: new Date() }
            })

        return res


    } catch (err) {
        console.log(err)
        return err;
    }
}

async function deleteRegola(client, id, regola, user) {
    try {
        const finanz = client.db(dbFinanz).collection(collFinanz);
        let query = { _id: ObjectId(id) }
        let res = await finanz.updateOne(query,
            {
                $pull: {
                    regole: {
                        rangeInizio: regola.rangeInizio,
                        rangeFine: regola.rangeFine,
                        tan: regola.tan,
                        taeg: regola.taeg,
                        nRate: regola.nRate

                    }
                },
                $set: { utenteUltimaModifica: user, dataUltimaModifica: new Date() }
            })

        return res
    } catch (err) {
        console.log(err)
        return err;
    }
}


module.exports = {
    getDatiFinanziaria: getDatiFinanziaria,
    getDatiFinanziariaDinamic: getDatiFinanziariaDinamic,
    getFinanziarie: getFinanziarie,
    setFinanziaria: setFinanziaria,
    postFinanziaria: postFinanziaria,
    switchFinanziaria: switchFinanziaria,
    deleteFinanziaria: deleteFinanziaria,
    postRegola: postRegola,
    deleteRegola: deleteRegola,
    getCurrentFin: getCurrentFin
}