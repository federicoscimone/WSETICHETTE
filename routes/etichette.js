require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
const MODE = process.env.MODE
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient } = require('mongodb')
const cron = require('node-cron');
const { getVariazioni, getCodiciVariazioni, getDatiEtichette } = require('../asFunction')
const { getScenariosName } = require('../database/etagConnection')
const { addEvent } = require('../database/utentiConnection')
const { getLabelsFromItem, postItems, generateSesJson, matchItems, getLabelsList } = require('../sesApi');
const { getCurrentFin, isNewFinancialDay } = require("../database/finanziariaConnection");
const mongoClient = new MongoClient(mongoDbUrl)

//SCHEDULING per le variazioni automatiche, impostato per ogni giorno 06:30, 07:30, 08:30
// aggiungere i punti vendita che passano alla nuova app o creare loop che invia lo stesso comando per tutte le sedi

cron.schedule('30 6,7,8 * * *', async () => {
    if (MODE === 'PROD') {
        variazioniAutomatiche('MI')
        variazioniAutomatiche('LC')
        variazioniAutomatiche('TV')
        variazioniAutomatiche('CE')
        logger.info("INVIO VARIAZIONI AUTOMATICHE")
    }

});

cron.schedule('40 6,7,8 * * *', async () => {
    if (MODE === 'PROD') {
        variazioniAutomatiche('MN')
        variazioniAutomatiche('VA')
        variazioniAutomatiche('MM')
        variazioniAutomatiche('GR')
        logger.info("INVIO VARIAZIONI AUTOMATICHE 2")
    }

});

cron.schedule('50 6,7,8 * * *', async () => {
    if (MODE === 'PROD') {
        variazioniAutomatiche('CP')
        variazioniAutomatiche('PD')
        variazioniAutomatiche('U2')
        variazioniAutomatiche('VR')
        logger.info("INVIO VARIAZIONI AUTOMATICHE 3")
    }

});

cron.schedule('59 6,7,8 * * *', async () => {
    if (MODE === 'PROD') {
        variazioniAutomatiche('PA')
        variazioniAutomatiche('UD')
        variazioniAutomatiche('ZA')
        variazioniAutomatiche('LO')
        variazioniAutomatiche('VI')
        logger.info("INVIO VARIAZIONI AUTOMATICHE 4")
    }

});

// FINE SCHEDULING

const variazioniAutomatiche = async (pv) => {
    try {

        let codici = await getCodiciVariazioni(pv)
        //let codici = []
        let currentLabels = await getLabelsList(pv)
        let isNewFinDay = await isNewFinancialDay(mongoClient, pv)

        if (isNewFinDay) {
            let labelConFin = currentLabels.filter(l => l.prezzo > 200 && l.type !== '2.6 BWR' && l.type !== '2.7 BWR').map(e => e.codice)
            codici = codici.concat(labelConFin)
        }

        if (codici) {
            if (codici.length > 0) {
                let finanziaria = null //req.body.finanziaria
                let scenario = null   //req.body.scenario
                let datiEtichette = await getDatiEtichette(pv, codici)


                if (datiEtichette) {
                    let json = await generateSesJson(pv, datiEtichette, finanziaria, scenario, 'system.user', currentLabels)

                    if (json.error) {
                        logger.error("errore nella generazione del json per ses " + json.error)
                    } else {
                        arrayToSes = json.json
                        arrayErrors = json.errors
                        let resToses = await postItems(pv, arrayToSes)
                        let correlationId = resToses.data.correlationId

                        if (correlationId) {
                            let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, errorList: arrayErrors, codici: codici, utente: 'system', pv: pv, scenario: scenario, finanziaria: finanziaria, type: "autoVariazione" }
                            addEvent(mongoClient, returnData)
                            logger.info("DataToSes system variazioni automatiche  pv " + pv + " correlationID " + correlationId)
                            return returnData;

                        } else {
                            logger.error("errore nella comunicazione con SES")
                        }
                    }
                }

                else {
                    logger.error("errore nel recupero dei dati degli articoli")
                }
            } else {
                logger.error("errore manca scenario o codici")
            }

        }

        else {
            logger.error("errore nell'ottenimento delle variazioni prezzo");
        }

    } catch (err) {
        console.log(err)
        logger.error(err)
    }
}

// invio dati associazione etichetta 
router.post('/match', async (req, res, next) => {
    try {
        let pv = req.query.pv ? req.query.pv : req.user.pv.sigla
        let user = req.user.username
        let arrayToSes = []
        let arrayErrors = []

        let codici = req.body.codici
        if (codici.length > 0) {
            let finanziaria = req.body.finanziaria
            let scenario = req.body.scenario
            let label = req.body.label
            let datiEtichette = await getDatiEtichette(pv, codici, req.user.WSIToken)

            if (datiEtichette) {
                let json = await generateSesJson(pv, datiEtichette, finanziaria, scenario, user)

                if (json.error) {
                    res.status(400).send(json[0].custom)
                } else {
                    arrayToSes = json.json
                    arrayErrors = json.errors
                    let resToses = await postItems(pv, arrayToSes)

                    if (resToses.data) {
                        let correlationId = resToses.data.correlationId

                        // invio a ses il matching con l'etichetta dopo l'invio dei dati
                        let matchToses = await matchItems(pv, label, scenario, codici[0])
                        if (matchToses.data) {
                            let correlationMatchId = matchToses.data.correlationId

                            logger.info("DataToSes " + user + " pv " + pv + " correlationID " + correlationId + " correlationMatchId " + correlationMatchId)
                            let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, correlationMatchId: correlationMatchId, errorList: arrayErrors, codici: codici, utente: user, pv: pv, scenario: scenario, finanziaria: finanziaria, type: "match", label: label }
                            addEvent(mongoClient, returnData)
                            res.status(200).send(returnData)
                        } else {
                            res.status(400).send({ error: "errore nella comunicazione con SES durante il matching con l'etichetta " + label })
                        }

                    } else {
                        res.status(400).send({ error: "errore nella comunicazione con SES" })
                    }
                }
            }
            else {
                res.status(400).send({ error: "errore nel recupero dei dati degli articoli" })
            }
        } else {
            res.status(400).send({ error: "errore manca scenario o codici" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

// invio dati prodotto a ses
router.post('/datatoses', async (req, res, next) => {
    try {
        let pv = req.query.pv ? req.query.pv : req.user.pv.sigla
        let user = req.user.username
        let arrayToSes = []
        let arrayErrors = []
        let test = req.query.test

        let codici = req.body.codici
        if (codici.length > 0) {
            let finanziaria = req.body.finanziaria
            let scenario = req.body.scenario
            let datiEtichette = await getDatiEtichette(pv, codici, req.user.WSIToken)

            if (datiEtichette) {
                let json = await generateSesJson(pv, datiEtichette, finanziaria, scenario, user)
                if (json.error) {
                    res.status(400).send(json)
                } else {
                    arrayToSes = json.json
                    arrayErrors = json.errors
                    let resToses = null
                    if (!test) { // se viene NON passato test nella query del percorso
                        resToses = await postItems(pv, arrayToSes)

                        if (resToses.data) {
                            let correlationId = resToses.data.correlationId
                            logger.info("DataToSes " + user + " pv " + pv + " correlationID " + correlationId)
                            let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, errorList: arrayErrors, codici: codici, utente: user, pv: pv, scenario: scenario, finanziaria: finanziaria, type: "update" }
                            addEvent(mongoClient, returnData)
                            res.status(200).send(returnData)
                        } else {
                            res.status(400).send({ error: "errore nella comunicazione con SES" })
                        }
                    } else { // è un test, quindi restituisci i dati composti per ses ma senza inviarli a loro
                        let returnData = { arrayToSes: arrayToSes, inviati: arrayToSes.length, errori: arrayErrors.length, errorList: arrayErrors, codici: codici, utente: user, pv: pv, scenario: scenario, finanziaria: finanziaria, type: "update" }
                        res.status(200).send(returnData)
                    }
                }
            }
            else {
                res.status(400).send({ error: "errore nel recupero dei dati degli articoli" })
            }
        } else {
            res.status(400).send({ error: "errore manca scenario o codici" })
        }

    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


// ottieni gli id delle etichette associate al codice
router.get('/getLabelsFromItem', async (req, res, next) => {
    try {

        let pv = req.user.pv.sigla
        let codice = req.query.codice

        let result = await getLabelsFromItem(pv, codice)
        if (result.status !== 200)
            res.status(404).send(result.response.data.message);
        else
            res.status(200).send(result.data.matching.labels)
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

// ottieni gli id delle etichette associate al codice
router.get('/scenarios', async (req, res, next) => {
    try {

        let result = await getScenariosName(mongoClient)
        if (!result[0])
            res.status(404).send({ errors: "errore nell'ottenimento degli scenari" });
        else
            res.status(200).send(result)
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


router.get('/variazioni', async (req, res, next) => { // se aggiunti ?group=true vengono restituite le variazioni raggruppate per settore gruppo sottogruppo
    try {
        let pv = req.query.pv ? req.query.pv : req.user.pv.sigla
        let group = req.query.group
        let variazioni = await getVariazioni(pv)

        if (variazioni) {
            if (group === "true") {
                let varArr = variazioni
                let arrayFam = []
                for (let i = 0; i < varArr.length; i++) {
                    let famiglia = varArr[i].LSSFAM.trim()
                    let gruppo = varArr[i].ANGRUP.trim()
                    let sottoGruppo = varArr[i].ANSTGR.trim()
                    let descrizione = varArr[i].LSDESC.trim()
                    let codice = varArr[i].ANCODI.trim()
                    let trovatoIndex = arrayFam.findIndex(e => { return e.famiglia === famiglia })
                    if (trovatoIndex >= 0) {
                        arrayFam[trovatoIndex].codici.push(codice)
                    } else {
                        arrayFam.push({ famiglia: famiglia, gruppo: gruppo, sottoGruppo: sottoGruppo, descrizione: descrizione, codici: [codice] })
                    }
                }
                res.status(200).send(arrayFam)
            }
            else {
                res.status(200).send(variazioni.data)
            }

        }
        else {
            res.status(404).send({ errors: "errore nell'ottenimento delle variazioni prezzo" });
        }

    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

router.get('/autovariazione', async (req, res, next) => {
    try {
        let pv = req.query.pv
        let variazioni = await variazioniAutomatiche(pv)
        console.log(variazioni)
        if (variazioni.inviati) {
            res.status(200).send(variazioni)
        }
        else {
            res.status(404).send({ errors: "errore nell'ottenimento automatico delle variazioni prezzo" });
        }

    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

router.get('/labellist', async (req, res, next) => {
    try {
        let pv = req.query.pv
        let list = await getLabelsList(pv)
        if (list) {
            res.status(200).send(list)
        }
        else {
            res.status(404).send({ errors: "errore nell'ottenimento della lista delle etichette" });
        }

    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})



module.exports = router;