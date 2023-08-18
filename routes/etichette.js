require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
const MINIMOFIN = process.env.MINIMOFIN
const serviceWSIUser = process.env.SERVICEUSER
const serviceWSIPass = process.env.SERVICEPASS


const WSIURL = process.env.WSIURL
const fs = require("fs").promises;
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const odbc = require("odbc");
const { MongoClient } = require('mongodb')
const axios = require('axios')
const cron = require('node-cron');

const { getScenariosName } = require('../database/etagConnection')
const { addEvent } = require('../database/utentiConnection')
const { getLabelsFromItem, postItems, generateSesJson } = require('../sesApi')
const { generaTokenWSI } = require('../routingUtility')
const mongoClient = new MongoClient(mongoDbUrl)
const connectString = "DSN=AS400;UserID=ACCLINUX;Password=ACCLINOX"

//SCHEDULING per le variazioni automatiche, impostato per ogni giorno 06:30, 07:30, 08:30
// aggiungere i punti vendita che passano alla nuova app o creare loop che invia lo stesso comando per tutte le sedi

cron.schedule('30 6,7,8 * * *', async () => {
    variazioniAutomatiche('LC')
    logger.info("INVIO VARIAZIONI AUTOMATICHE PER LC")
});

const getDatiEtichette = async (pv, codici, token) => {
    return await axios({
        method: 'get', url: WSIURL + '/as400/codelabeldata',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        data: {
            pv: pv,
            codici: codici
        }
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE: " + err)
        return ({ error: "errore connessione WSI" })
    })
}


const getCodiciVariazioni = async (pv, token) => {
    let variazioni = await axios({
        method: 'get', url: WSIURL + `/as400/variazioni?data=${formatDataToAS(new Date())}&pv=${pv}`,
        headers: {
            Authorization: `Bearer ${token}`,
        }
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE recupero variazioni prezzo: " + err)
        return ({ error: "errore connessione WSI " })
    })

    return variazioni.data.map(x => { return x.ANCODI.trim() })
}

const getVariazioni = async (pv, token) => {
    return await axios({
        method: 'get', url: WSIURL + `/as400/variazioni?data=${formatDataToAS(new Date())}&pv=${pv}`,
        headers: {
            Authorization: `Bearer ${token}`,
        }
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE recupero variazioni prezzo: " + err)
        return ({ error: "errore connessione WSI " })
    })

}

const variazioniAutomatiche = async (pv) => {
    try {
        //console.log(pv)
        let wsi = await generaTokenWSI(serviceWSIUser, serviceWSIPass)
        //let codici = await getCodiciVariazioni(pv, wsi.data.token)
        codici = ["WW11BGA046AT", "KFN96VPEA", "B10215"]
        console.log(codici)
        if (codici) {
            if (codici.length > 0) {
                let finanziaria = "autovariazione"//req.body.finanziaria
                let scenario = null//req.body.scenario
                let datiEtichette = await getDatiEtichette(pv, codici, wsi.data.token)

                if (datiEtichette) {
                    let json = await generateSesJson(pv, datiEtichette.data, finanziaria, scenario, 'system.user')

                    if (json.error) {
                        logger.error("errore nella generazione del json per ses " + json.error)
                    } else {
                        arrayToSes = json.json
                        arrayErrors = json.errors
                        let resToses = await postItems(pv, arrayToSes)
                        let correlationId = resToses.data.correlationId

                        if (correlationId) {
                            let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, errorList: arrayErrors, codici: codici, utente: 'system', pv: pv, scenario: scenario, finanziaria: finanziaria }
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

// invio dati associazione etichetta -----------------> WIP <-------------------
router.post('/match', async (req, res, next) => {
    try {
        let pv = req.user.pv.sigla
        let user = req.user.username
        let arrayToSes = []
        let arrayErrors = []

        let codici = req.body.codici
        if (codici.length > 0) {
            let finanziaria = req.body.finanziaria
            let scenario = req.body.scenario

            let datiEtichette = await getDatiEtichette(pv, codici, req.user.WSIToken)

            if (datiEtichette) {
                let json = await generateSesJson(pv, datiEtichette.data, finanziaria, scenario, user)

                if (json.error) {
                    res.status(400).send(json[0].custom)
                } else {
                    arrayToSes = json.json
                    arrayErrors = json.errors
                    let resToses = await postItems(pv, arrayToSes)
                    //console.log(resToses)


                    if (resToses.data) {
                        let correlationId = resToses.data.correlationId
                        logger.info("DataToSes " + user + " pv " + pv + " correlationID " + correlationId)
                        let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, errorList: arrayErrors, codici: codici, utente: user, pv: pv, scenario: scenario, finanziaria: finanziaria }
                        addEvent(mongoClient, returnData)
                        res.status(200).send(returnData)
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
        let pv = req.user.pv.sigla
        let user = req.user.username
        let arrayToSes = []
        let arrayErrors = []

        let codici = req.body.codici
        if (codici.length > 0) {
            let finanziaria = "autoassegna"//req.body.finanziaria
            let scenario = req.body.scenario

            let datiEtichette = await getDatiEtichette(pv, codici, req.user.WSIToken)

            if (datiEtichette) {
                let json = await generateSesJson(pv, datiEtichette.data, finanziaria, scenario, user)
                // console.log(json)
                if (json.error) {
                    res.status(400).send(json[0].custom)
                } else {
                    arrayToSes = json.json
                    arrayErrors = json.errors
                    let resToses = await postItems(pv, arrayToSes)
                    //console.log(resToses)


                    if (resToses.data) {
                        let correlationId = resToses.data.correlationId
                        logger.info("DataToSes " + user + " pv " + pv + " correlationID " + correlationId)
                        let returnData = { inviati: arrayToSes.length, errori: arrayErrors.length, correlationId: correlationId, errorList: arrayErrors, codici: codici, utente: user, pv: pv, scenario: scenario, finanziaria: finanziaria }
                        addEvent(mongoClient, returnData)
                        res.status(200).send(returnData)
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

function formatDataToAS(data) {
    let ASFormatted = data.toISOString().substring(0, 4) + "-" + data.toISOString().substring(5, 7) + "-" + data.toISOString().substring(8, 10)
    return ASFormatted
}


// ottieni gli id delle etichette associate al codice
router.get('/variazioni', async (req, res, next) => { // se aggiunti ?group=true vengono restituite le variazioni raggruppate per settore gruppo sottogruppo
    try {
        let pv = req.user.pv.sigla
        let group = req.query.group
        let variazioni = await getVariazioni(pv, req.user.WSIToken)

        if (variazioni) {
            if (group === "true") {
                let varArr = variazioni.data
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


// ottieni gli id delle etichette associate al codice
router.get('/autovariazione', async (req, res, next) => {
    try {
        let pv = req.query.pv
        let variazioni = await variazioniAutomatiche(pv)
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




/*
router.post('/vcloud', async function (req, res, next) {
    try {

        let codici = req.body.codici
        let pv = req.body.pv
        let now = new Date()
        let timestamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_T${now.getHours()}:${now.getMinutes()}`
        //let nomeFile = `./csv/test_${timestamp}.csv`

        let jsonToSes = {}

        for (let i = 0; i < codici.length; i++) {
            let articolo = await getDatiArticolo(codici[i], pv)



            // let riga = `${articolo.CODICE};${articolo.CODICE};;${articolo.PREZZO.toFixed(2)};${articolo.PREZZOCONSIGLIATO.toFixed(2)};${articolo.PREZZOPRECEDENTE.toFixed(2)};${articolo.MARCA};${articolo.MARCA};${articolo.DESCRIZIONE};${articolo.BARCODE};;;;;;;;;${articolo.ECATLINK};"01";"01";;;;;;;;;;;;;;${mergeCARFields(articolo)}`


        }
        //console.log(result)
        // if (body.CODICE) {
        res.download(nomeFile)
        //}
        //else {
        //   res.status(404).send(result.errore);
        // }


    } catch (err) {
        console.log(err)
        logger.error(err)
    }

});


router.get('/csv', async function (req, res, next) {
    try {

        let codici = req.body.codici
        let pv = req.body.pv
        let now = new Date()
        let timestamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_T${now.getHours()}:${now.getMinutes()}`
        let nomeFile = `./csv/test_${timestamp}.csv`

        for (let i = 0; i < codici.length; i++) {
            let articolo = await getDatiArticolo(codici[i], pv)

            let riga = `${articolo.CODICE};${articolo.CODICE};;${articolo.PREZZO.toFixed(2)};${articolo.PREZZOCONSIGLIATO.toFixed(2)};${articolo.PREZZOPRECEDENTE.toFixed(2)};${articolo.MARCA};${articolo.MARCA};${articolo.DESCRIZIONE};${articolo.BARCODE};;;;;;;;;${articolo.ECATLINK};"01";"01";;;;;;;;;;;;;;${mergeCARFields(articolo)}`
            await fs.writeFile(nomeFile, riga, { flag: 'a' });
        }
        //console.log(result)
        // if (body.CODICE) {
        res.download(nomeFile)
        //}
        //else {
        //   res.status(404).send(result.errore);
        // }


    } catch (err) {
        console.log(err)
        logger.error(err)
    }

});*/

module.exports = router;