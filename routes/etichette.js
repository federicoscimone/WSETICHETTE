require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
const MINIMOFIN = process.env.MINIMOFIN

const WSIURL = process.env.WSIURL
const fs = require("fs").promises;
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const odbc = require("odbc");
const { MongoClient } = require('mongodb')
const axios = require('axios')
const { getDatiFinanziaria } = require('../database/finanziariaConnection')
const { getIdScenarioFromName } = require('../database/etagConnection')
const { getLabelsFromItem } = require('../sesApi')
const mongoClient = new MongoClient(mongoDbUrl)

const connectString = "DSN=AS400;UserID=ACCLINUX;Password=ACCLINOX"

const connectionConfig = {
    connectionString: connectString,
    connectionTimeout: 3,
    loginTimeout: 3,
}


// invio dati prodotto a ses
router.post('/datatoses', async (req, res, next) => {
    try {
        let pv = req.user.pv.sigla
        let user = req.user.username
        let arrayToSes = []
        let arrayErrors = []
        console.log("invio dati da " + user + " dal pv " + pv)
        let codici = req.body.codici
        let finanziaria = req.body.finanziaria
        let datiEtichette = await axios({
            method: 'get', url: WSIURL + '/as400/codelabeldata',
            headers: {
                Authorization: `Bearer ${req.user.WSIToken}`,
            },
            data: {
                pv: pv,
                codici: codici
            }
        }).catch((err) => {
            console.log(err)
            logger.error("ERRORE: " + err)
        })
        if (datiEtichette) {

            if (finanziaria) {
                for (let i = 0; i < datiEtichette.data.length; i++) {
                    if (!datiEtichette.data[i].error) {
                        datiEtichette.data[i].datiFin = await getDatiFinanziaria(datiEtichette.data[i].PREZZO, pv, finanziaria)
                    }

                }
            }

            for (let y = 0; y < datiEtichette.data.length; y++) {
                console.log(datiEtichette.data[y].error)
                if (datiEtichette.data[y].error) {
                    arrayErrors.push(datiEtichette.data[y].error)

                }
                else {
                    //composizione json per vcloud secondo la semantica stabilita su studio
                    let toSES = {
                        "CODICE": datiEtichette.data[y].CODICE,
                        "CODICEEURONICS": datiEtichette.data[y].CODICEEURONICS,
                        "BARCODE": datiEtichette.data[y].BARCODE,
                        "DESCRIZIONE": datiEtichette.data[y].DESCRIZIONE,
                        "MARCA": datiEtichette.data[y].MARCA,
                        "PREZZOPRECEDENTE": datiEtichette.data[y].PREZZOPRECEDENTE,
                        "PREZZOCONSIGLIATO": datiEtichette.data[y].PREZZOCONSIGLIATO,
                        "PREZZO": datiEtichette.data[y].PREZZO,
                        "PREZZOFUTURO": datiEtichette.data[y].PREZZOFUTURO,
                        "PREZZOVANTAGE": datiEtichette.data[y].PREZZOVANTAGE,
                        "PREZZOMINIMO": datiEtichette.data[y].PREZZOMINIMO,
                        "IMGLINK": datiEtichette.data[y].IMGLINK,
                        "ECATLINK": datiEtichette.data[y].ECATLINK,
                        "CARATTERISTICHE": datiEtichette.data[y].CARATTERISTICHE,
                        "PROROGA": datiEtichette.data[y].datiFin.proroga,
                        //"SLOGAN": datiEtichette.data[y].SLOGAN,
                        "STELLE": Math.floor(datiEtichette.data[y].PREZZO),
                    }
                    if (finanziaria) {
                        toSES.RATA = datiEtichette.data[y].datiFin.rata
                        toSES.NRATE = datiEtichette.data[y].datiFin.nrate
                        toSES.TAN = datiEtichette.data[y].datiFin.tan
                        toSES.TAEG = datiEtichette.data[y].datiFin.taeg
                    }
                    if (datiEtichette.data[y].icon) {
                        toSES.ICO1 = datiEtichette.data[y].icon.IDICO1
                        toSES.ICOVALUE1 = datiEtichette.data[y].icon.VALUE1
                        toSES.ICO2 = datiEtichette.data[y].icon.IDICO2
                        toSES.ICOVALUE2 = datiEtichette.data[y].icon.VALUE2
                        toSES.ICO3 = datiEtichette.data[y].icon.IDICO3
                        toSES.ICOVALUE3 = datiEtichette.data[y].icon.VALUE3
                        toSES.ICO4 = datiEtichette.data[y].icon.IDICO4
                        toSES.ICOVALUE4 = datiEtichette.data[y].icon.VALUE4
                        toSES.ICO5 = datiEtichette.data[y].icon.IDICO5
                        toSES.ICOVALUE5 = datiEtichette.data[y].icon.VALUE5
                        toSES.ICO6 = datiEtichette.data[y].icon.IDICO6
                        toSES.ICOVALUE6 = datiEtichette.data[y].icon.VALUE6
                    }
                    arrayToSes.push(toSES)
                }

            }

            res.status(200).send(arrayToSes)
        }
        else {
            res.status(400).send({ error: "errore nel recupero dei dati degli articoli" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


//WIP
router.post('/scenario', async (req, res, next) => {
    try {
        let pv = req.user.pv.sigla
        let codice = req.query.codice
        let scenario = req.query.scenario

        let labels = await getLabelsFromItem(mongoClient, pv, codice)
        let idScenario = await getIdScenarioFromName(mongoClient, scenario)
        console.log(idScenario)
        res.status(200).send(idScenario)
        /*if (result.status !== 200)
            res.status(404).send(result.response.data.message);
        else
            res.status(200).send(result.data.matching.labels)*/
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

        let result = await getLabelsFromItem(mongoClient, pv, codice)
        if (result.status !== 200)
            res.status(404).send(result.response.data.message);
        else
            res.status(200).send(result.data.matching.labels)
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})




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

});

module.exports = router;