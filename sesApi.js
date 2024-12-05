require("dotenv").config();
const SESKEY = process.env.SESKEY
const SESKEYPRO = process.env.SESKEYPRO
const WSIURL = process.env.WSIURL
const serviceWSIPass = process.env.SERVICEPASS
const serviceWSIUser = process.env.SERVICEUSER
const MODE = process.env.MODE
const mongoDbUrl = process.env.MONGODBURL
const logger = require('./logger');
const axios = require('axios');
const { MongoClient } = require('mongodb')
const mongoClient = new MongoClient(mongoDbUrl)

const { getDatiFinanziariaDinamic } = require('./database/finanziariaConnection')
const { getIdScenarioFromName, getTagFromScenarioId, getScenariosName } = require('./database/etagConnection');
const { generaTokenWSI } = require('./routingUtility')

const getSesId = async (sigla) => {
    let wsi = await generaTokenWSI(serviceWSIUser, serviceWSIPass)
    let resp = await axios({
        method: 'get', url: WSIURL + '/puntivendita/sesid?pv=' + sigla,
        headers: {
            Authorization: `Bearer ${wsi.data.token}`,
        },
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE: " + err)
        return ({ error: "errore recupero collegamento con WSI" })
    })
    return resp.data
}

const getLabelsListVusion = async (siglapv, page) => {
    try {

        let idSes = await getSesId(siglapv)
        page = page ? page : 1
        let result = await axios.get(`https://api-eu.vusion.io/vusion-pro/v1/stores/${idSes}/labels?includes=matching.items.custom,matching.items.id,matching.items.price,labelId,status,hardware.typeName&pageSize=1000&page=${page}`, {
            headers: {
                'Ocp-Apim-Subscription-Key': SESKEYPRO
            }
        }).catch(err => {
            console.log(err)
            logger.error(err)
            return err
        })
        return result.data

    } catch (err) {
        logger.error("errore " + err)
    }
}

const getOrientFromName = (scenarios, scenario) => {
    if (scenario) {
        let find = scenarios.find(e => e.scenarioId === scenario)
        return find.orientation
    } else {
        return 'orizzontale'
    }

}

const getScenarioTags = (scenarios, scenario) => {
    if (scenario) {
        let find = scenarios.find(e => e.scenarioId === scenario)
        if (find.tag)
            return find.tag
        else return []
    } else {
        return []
    }

}

const getLabelsList = async (siglapv) => {
    try {
        let scenarios = await getScenariosName(mongoClient)
        let result = await getLabelsListVusion(siglapv)
        let labels = result.values
        let numPage = Math.floor(result.count / 1000) + 1
        if (numPage > 1) {
            for (let i = 2; i <= numPage; i++) {
                result = await getLabelsListVusion(siglapv, i)
                labels = labels.concat(result.values)
            }
        }
        let list = []

        labels.forEach(label => {
            if (label.matching && label.matching.items[0].custom) {
                let prezzo = label.matching.items[0].price
                let codice = label.matching.items[0].id
                let scenario = label.matching.items[0].custom.scenario
                let type = label.hardware.typeName
                let isRataScenario = getScenarioTags(scenarios, scenario).includes('rata')
                let orientamento = getOrientFromName(scenarios, scenario)

                list.push({
                    codice: codice,
                    scenario: scenario,
                    orientamento: orientamento,
                    rata: isRataScenario,
                    type: type,
                    prezzo: prezzo
                })
            }
        })
        return list

    } catch (err) {
        console.log(err)
        logger.error("errore " + err)
    }
}


const getLabelsFromItem = async (siglapv, codice) => {
    try {
        let idSes = MODE === 'DEV' ? 'brunoeuronics_it.vlab' : await getSesId(siglapv)
        let result = await axios.get(`https://api-eu.vusion.io/vcloud/v1/stores/${idSes}/items/${codice}?includes=matching.labels`, {
            headers: {
                'Ocp-Apim-Subscription-Key': SESKEY
            }
        }).catch(err => {
            logger.error(err)
            return err
        })

        return result.data.matching.labels

    } catch (err) {
        logger.error("errore " + err)
    }
}

const postItems = async (siglapv, dati) => {
    try {
        let idSes = (siglapv === 'PR') ? 'brunoeuronics_it.vlab' : await getSesId(siglapv)
        let result = await axios.post(`https://api-eu.vusion.io/vcloud/v1/stores/${idSes}/items/`,
            dati,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': SESKEY
                }
            }).catch(err => {
                logger.error(err)
                return err
            })
        return result

    } catch (err) {
        console.log(err)
        logger.error("errore " + err)
    }
}


const matchItems = async (siglapv, labelID, scenarioID, itemID) => {
    try {
        let dati =
            [
                {
                    labelId: labelID,
                    scenarioId: scenarioID,
                    items: [
                        {
                            itemId: itemID
                        }
                    ]
                }
            ]

        let idSes = (siglapv === 'PR') ? 'brunoeuronics_it.vlab' : await getSesId(siglapv)
        let result = await axios.post(`https://api-eu.vusion.io/vcloud/v1/stores/${idSes}/labels/matchings`,
            dati,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': SESKEY
                }
            }).catch(err => {
                logger.error(err)
                return err
            })
        return result

    } catch (err) {
        console.log(err)
        logger.error("errore " + err)
    }
}



const generateSesJson = async (pv, datiEtichette, finanziaria, scenario, user, currentLabels) => {
    try {
        let arrayErrors = []
        let arrayToSes = []
        if (scenario === "dataOnly") scenario = null

        //recupero dati finanziari per ogni codice
        for (let i = 0; i < datiEtichette.length; i++) {
            if (!datiEtichette[i].error) {

                if (finanziaria.includes("STAR DAYS")) {
                    datiEtichette[i].datiFin = await getDatiFinanziariaDinamic(datiEtichette[i].PREZZOVANTAGE, pv, finanziaria);
                } else {
                    datiEtichette[i].datiFin = await getDatiFinanziariaDinamic(datiEtichette[i].PREZZO, pv, finanziaria);
                }
            }
        }


        console.log(datiEtichette)
        for (let y = 0; y < datiEtichette.length; y++) {
            if (datiEtichette[y]) {
                if (datiEtichette[y].error) {
                    arrayErrors.push(datiEtichette[y])
                }
                else {
                    //composizione json per vcloud secondo la semantica stabilita su studio
                    let CODICE = datiEtichette[y].CODICE
                    let toSES = {
                        id: CODICE,
                        price: datiEtichette[y].PREZZO,
                        description: datiEtichette[y].DESCRIZIONE,
                        references: [datiEtichette[y].BARCODE],
                        brand: datiEtichette[y].MARCA,
                        name: datiEtichette[y].CODICEEURONICS,
                        custom: {
                            utente: user,
                            prezzoPrecedente: datiEtichette[y].PREZZOPRECEDENTE ? datiEtichette[y].PREZZOPRECEDENTE.toString() : "",
                            prezzoConsigliato: datiEtichette[y].PREZZOCONSIGLIATO ? datiEtichette[y].PREZZOCONSIGLIATO.toString() : "",
                            prezzoFuturo: datiEtichette[y].PREZZOFUTURO ? datiEtichette[y].PREZZOFUTURO.toString() : "",
                            prezzoVantage: datiEtichette[y].PREZZOVANTAGE ? datiEtichette[y].PREZZOVANTAGE.toString() : "",
                            prezzoMinimo: datiEtichette[y].PREZZOMINIMO ? datiEtichette[y].PREZZOMINIMO.toString() : "",
                            caratteristiche: datiEtichette[y].CARATTERISTICHE ? datiEtichette[y].CARATTERISTICHE.toString() : "",
                            stelle: Math.floor(datiEtichette[y].PREZZO).toString(),
                        },
                        multimedia: {
                            url: datiEtichette[y].ECATLINK,
                            nfc: datiEtichette[y].ECATLINK,
                        }
                    }

                    // if (finanziaria) {
                    if (datiEtichette[y].datiFin.error) {
                        // procedi solo se il recupero della finanziaria non ha generato errori
                    } else {
                        toSES.custom.rata = datiEtichette[y].datiFin.rata.toString()
                        toSES.custom.nrate = datiEtichette[y].datiFin.nrate.toString()
                        toSES.custom.tan = datiEtichette[y].datiFin.tan.toString()
                        toSES.custom.taeg = datiEtichette[y].datiFin.taeg.toString()
                        toSES.custom.proroga = datiEtichette[y].datiFin.proroga.toString()
                        toSES.custom.finanziaria = datiEtichette[y].datiFin.nome.toString()
                    }
                    // }

                    // VERIFICA SCENARIO ATTUALE E ORIENTAMENTO DA APPLICARE -  solo se viene passato currentLabel quindi solo quando la variazione è automatica
                    if (currentLabels) {
                        let find = currentLabels.find(e => e.codice === CODICE)
                        if (find) {
                            if (find.orientamento === 'verticale') scenario = 'prezzoConsRataVert'
                            else scenario = 'prezzoConsRata'
                        }
                        else {
                            arrayErrors.push({ codice: CODICE, error: `Nessuna etichetta associata al codice` })
                        }
                    }
                    ///////////////////////////////////////////////////////

                    if (scenario) {
                        let scenarioToses = scenario

                        //  GESTIONE SCENARI NON APPLICABILI - UNA SERIE DI CONDIZIONI CHE IN CASO DI SCENARIO NON APPLICABILE NE SCELGONO IL PIU VICINO CHE PUò ESSERE APPLICATO

                        //SCENARI ORIZZONTALI   
                        //se lo scenario è Prezzo Tagliato ma il prezzo minimo non è valido
                        if (scenario === 'NOPROMO' && toSES.custom.prezzoMinimo <= toSES.price) {
                            scenarioToses = 'default'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo mimino < prezzo, applicato scenario default` })
                        }

                        //se lo scenario è Prezzo Tagliato Starclub ma il prezzo minimo non è valido
                        if (scenario === 'StarCutH' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'default'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo consigliato < prezzo, applicato scenario default` })
                        }

                        //se lo scenario è Prezzo Consigliato ma il prezzo consigliato non è valido
                        if (scenario === 'prezzoCons' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'default'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo consigliato < prezzo, applicato scenario default` })
                        }

                        //se lo scenario è Finanziaria ma l'importo non è finanziabile
                        if (scenario === 'TASSO0' && datiEtichette[y].datiFin.error) {
                            scenarioToses = 'default'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario default` })
                        }

                        // se lo scenario è Finanziaria Prezzo Tagliato
                        if (scenario === 'FINANZIARIA2') {

                            // se l'importo NON è finanziabile e il prezzo minimo non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'default'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo mimino e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo minimo  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo > toSES.price) {
                                // allora applico lo scenario Prezzo Tagliato
                                scenarioToses = 'NOPROMO'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Tagliato` })
                            }

                            // se l'importo è finanziabile e il prezzo minimo non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'TASSO0'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo mimino, applicato scenario Finanziaria` })
                            }

                        }

                        // se lo scenario è Finanziaria Prezzo Consigliato
                        if (scenario === 'prezzoConsRata') {

                            // se l'importo NON è finanziabile e il prezzo Consigliato non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'default'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo consigliato  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Consigliato
                                scenarioToses = 'prezzoCons'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato` })
                            }


                            // se l'importo è finanziabile e il prezzo consigliato non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'TASSO0'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }

                        }


                        //se lo scenario è Prezzo Consigliato tagliato ma il prezzo consigliato non è valido
                        if (scenario === 'prezzoConsCutRataH' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'default'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo consigliato < prezzo, applicato scenario default` })
                        }

                        // se lo scenario è Finanziaria Prezzo Consigliato tagliato
                        if (scenario === 'prezzoConsCutRataH') {

                            // se l'importo NON è finanziabile e il prezzo Consigliato non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'default'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo consigliato  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Consigliato
                                scenarioToses = 'prezzoConsCutH'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato tagliato` })
                            }

                            // se l'importo è finanziabile e il prezzo consigliato non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'TASSO0'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }

                        }


                        // se lo scenario è Finanziaria Prezzo minimo tagliato StarClub
                        if (scenario === 'StarCutFinH') {

                            // se l'importo NON è finanziabile e il prezzo Minimo non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'default'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo minimo  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Minimo
                                scenarioToses = 'StartCutH'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato tagliato` })
                            }

                            // se l'importo è finanziabile e il prezzo consigliato non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'TASSO0'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }

                        }

                        //SCENARI VERTICALI   
                        //se lo scenario è Prezzo Tagliato ma il prezzo minimo non è valido
                        if (scenario === 'CUTVERT_1' && toSES.custom.prezzoMinimo <= toSES.price) {
                            scenarioToses = 'CUTVERT'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo mimino < prezzo, applicato scenario default` })
                        }

                        //se lo scenario è Prezzo StarClub ma il prezzo minimo non è valido
                        if (scenario === 'StarCutV' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'CUTVERT'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo consigliato < prezzo, applicato scenario default` })
                        }
                        //se lo scenario è Prezzo Consigliato ma il prezzo consigliato non è valido
                        if (scenario === 'prezzoConsVert' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'CUTVERT'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `rezzo consigliato < prezzo, applicato scenario default` })
                        }

                        //se lo scenario è Finanziaria ma l'importo non è finanziabile
                        if (scenario === 'T0VERT' && datiEtichette[y].datiFin.error) {
                            scenarioToses = 'CUTVERT'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario default verticale` })
                        }

                        // se lo scenario è Finanziaria Prezzo Tagliato
                        if (scenario === 'T0VERTCUT') {

                            // se l'importo NON è finanziabile e il prezzo minimo non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'CUTVERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo mimino e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo minimo  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo > toSES.price) {
                                // allora applico lo scenario Prezzo Tagliato
                                scenarioToses = 'CUTVERT_1'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Tagliato` })
                            }


                            // se l'importo è finanziabile e il prezzo minimo non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoMinimo <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'T0VERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo mimino, applicato scenario Finanziaria` })
                            }

                        }

                        // se lo scenario è Finanziaria Prezzo Consigliato
                        if (scenario === 'prezzoConsRataVert') {

                            // se l'importo NON è finanziabile e il prezzo Consigliato non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'CUTVERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo consigliato  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Consigliato
                                scenarioToses = 'prezzoConsVert'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato` })
                            }


                            // se l'importo è finanziabile e il prezzo minimo non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'T0VERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }

                        }

                        //se lo scenario è Prezzo Consigliato tagliato ma il prezzo consigliato non è valido
                        if (scenario === 'prezzoConsCutV' && toSES.custom.prezzoConsigliato <= toSES.price) {
                            scenarioToses = 'CUTVERT'
                            arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo consigliato < prezzo, applicato scenario default` })
                        }

                        // se lo scenario è Finanziaria Prezzo Consigliato
                        if (scenario === 'prezzoConsCutRataV') {

                            // se l'importo NON è finanziabile e il prezzo Consigliato non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'CUTVERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo consigliato  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Consigliato
                                scenarioToses = 'prezzoConsCutV'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato tagliato` })
                            }


                            // se l'importo è finanziabile e il prezzo consigliato non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'T0VERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }

                        }



                        // se lo scenario è Finanziaria Prezzo StarClub
                        if (scenario === 'StarCutFinV') {

                            // se l'importo NON è finanziabile e il prezzo Minimo non è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario default
                                scenarioToses = 'CUTVERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato e importo non finanziabile, applicato scenario default` })
                            }

                            // se l'importo NON è finanziabile ma il prezzo minimo  è valido
                            if (datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato > toSES.price) {
                                // allora applico lo scenario Prezzo Minimo
                                scenarioToses = 'StarCutV'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Importo non finanziabile, applicato scenario Prezzo Consigliato tagliato` })
                            }


                            // se l'importo è finanziabile e il prezzo minimo non è valido
                            if (!datiEtichette[y].datiFin.error && toSES.custom.prezzoConsigliato <= toSES.price) {
                                // allora applico lo scenario Finanziaria
                                scenarioToses = 'T0VERT'
                                arrayErrors.push({ codice: datiEtichette[y].CODICE, error: `Prezzo  > prezzo Consigliato, applicato scenario Finanziaria` })
                            }


                        }




                        toSES.custom.scenario = scenarioToses
                    } else {

                    }
                    if (datiEtichette[y].icon) {
                        if (datiEtichette[y].icon.IDICO1) toSES.custom.ico1 = datiEtichette[y].icon.IDICO1.toString()
                        if (datiEtichette[y].icon.VALUE1) toSES.custom.icovalue1 = datiEtichette[y].icon.VALUE1 === '0' ? "" : datiEtichette[y].icon.VALUE1.toString()
                        if (datiEtichette[y].icon.IDICO2) toSES.custom.ico2 = datiEtichette[y].icon.IDICO2.toString()
                        if (datiEtichette[y].icon.VALUE2) toSES.custom.icovalue2 = datiEtichette[y].icon.VALUE2 === '0' ? "" : datiEtichette[y].icon.VALUE2.toString()
                        if (datiEtichette[y].icon.IDICO3) toSES.custom.ico3 = datiEtichette[y].icon.IDICO3.toString()
                        if (datiEtichette[y].icon.VALUE3) toSES.custom.icovalue3 = datiEtichette[y].icon.VALUE3 === '0' ? "" : datiEtichette[y].icon.VALUE3.toString()
                        if (datiEtichette[y].icon.IDICO4) toSES.custom.ico4 = datiEtichette[y].icon.IDICO4.toString()
                        if (datiEtichette[y].icon.VALUE4) toSES.custom.icovalue4 = datiEtichette[y].icon.VALUE4 === '0' ? "" : datiEtichette[y].icon.VALUE4.toString()
                        if (datiEtichette[y].icon.IDICO5) toSES.custom.ico5 = datiEtichette[y].icon.IDICO5.toString()
                        if (datiEtichette[y].icon.VALUE5) toSES.custom.icovalue5 = datiEtichette[y].icon.VALUE5 === '0' ? "" : datiEtichette[y].icon.VALUE5.toString()
                        if (datiEtichette[y].icon.IDICO6) toSES.custom.ico6 = datiEtichette[y].icon.IDICO6.toString()
                        if (datiEtichette[y].icon.VALUE6) toSES.custom.icovalue6 = datiEtichette[y].icon.VALUE6 === '0' ? "" : datiEtichette[y].icon.VALUE6.toString()

                    }
                    arrayToSes.push(toSES)
                }
            } else { console.log("trovato null") }
        }

        return { json: arrayToSes, errors: arrayErrors }
    } catch (err) {
        console.log(err)
        return { error: "errore nella conversione dei dati per ses" }
    }

}

const generateSesScenarioJson = async (client, pv, codici, scenario, orientamento) => {

    let arrayErrors = []
    let arrayToSes = []
    for (let y = 0; y < codici.length; y++) {
        let labels = await getLabelsFromItem(client, pv, codici[y])
        let idScenario = await getIdScenarioFromName(client, scenario, orientamento)
        if (labels.length > 0) {

        }
        else {
            arrayErrors.push({ error: "Nessun etichetta associata al codice " + codici[y] })
        }

        /*  if (datiEtichette[y].error) {
              arrayErrors.push(datiEtichette[y].error)
          }
          else {
              //composizione json per vcloud secondo la semantica stabilita su studio
              let toSES = {
                  id: datiEtichette[y].CODICE,
                  price: datiEtichette[y].PREZZO,
                  description: datiEtichette[y].DESCRIZIONE,
                  references: [datiEtichette[y].BARCODE],
                  brand: datiEtichette[y].MARCA,
                  name: datiEtichette[y].CODICEEURONICS,
                  custom: {
                      prezzoPrecedente: datiEtichette[y].PREZZOPRECEDENTE.toString(),
                      prezzoConsigliato: datiEtichette[y].PREZZOCONSIGLIATO.toString(),
                      prezzoFuturo: datiEtichette[y].PREZZOFUTURO.toString(),
                      prezzoVantage: datiEtichette[y].PREZZOVANTAGE.toString(),
                      prezzoMinimo: datiEtichette[y].PREZZOMINIMO.toString(),
                      caratteristiche: datiEtichette[y].CARATTERISTICHE.toString(),
                      stelle: Math.floor(datiEtichette[y].PREZZO).toString(),
                  }
              }
              arrayToSes.push(toSES)
          }*/

    }
    return { json: arrayToSes, errors: arrayErrors }

}

module.exports = {
    getLabelsFromItem: getLabelsFromItem,
    postItems: postItems,
    generateSesJson: generateSesJson,
    generateSesScenarioJson: generateSesScenarioJson,
    matchItems: matchItems,
    getLabelsList: getLabelsList
}