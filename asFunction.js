require("dotenv").config();
const IPECAT = process.env.IPECAT
const USERECAT = process.env.USERECAT

const odbc = require("odbc");
const logger = require('./logger');

const connectString = "DSN=AS400;UserID=ACCLINUX;Password=ACCLINOX"

const connectionConfig = {
    connectionString: connectString,
    connectionTimeout: 3,
    loginTimeout: 3,
}


// funzione che elimina i caratteri vuoti su ogni campo in formato stringa
function trimObjectFields(obj) {
    for (let key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key].trim();
        }
    }
    return obj;
}

// unisci le caratteristiche in un unica stringa
function mergeCARFields(data) {
    let mergedString = "";
    for (const key in data) {
        if (key.startsWith("CAR")) {
            if (data[key]) {
                const fieldValue = data[key].trim();
                if (fieldValue !== "") {
                    mergedString += fieldValue + " • ";
                }
            }
        }
    }
    // Rimuovi l'ultimo carattere "•" e gli spazi bianchi finali
    mergedString = mergedString.trim().slice(0, -1);
    return mergedString;
}

function formatDataToAS(data) {
    let ASFormatted = data.toISOString().substring(2, 4) + data.toISOString().substring(5, 7) + data.toISOString().substring(8, 10)
    return ASFormatted
}

async function getVariazioniFunc(data, pv) {
    try {
        let giorno = new Date(data)

        const AS = await odbc.connect(connectionConfig)
        const query = `SELECT  ANCODI,LSSFAM,PAPVEN,PADATA,PAORA,PAFLAT,PAPPAT,PAFLAV,PAPPAV,LSDESC,concat(T2.LSLINE,T2.LSSETT) AS KEY,ANGRUP,ANSTGR
        FROM newstore.lprat,
        (Select ANCODI,ANGRUP,ANSTGR from bremag.artic) AS T0,
        (Select LSSFAM,LSSETT,LSLINE from board.lisea1) as T1,
        (Select LSLINE,LSSETT,LSDESC from board.lisea1 where LSFAMI = '' and LSSETT != '' ) as T2
           where
           (T0.ANCODI = PACODI)
           and
       ((concat(T0.ANGRUP,T0.ANSTGR) = T1.LSSFAM) and (concat(T1.LSLINE,T1.LSSETT) = concat(T2.LSLINE,T2.LSSETT)))
           and
           (PAPVEN='${pv}'and PADATA='${formatDataToAS(giorno)}')
           Order by PADATA DESC,PAORA DESC,LSDESC,concat(T2.LSLINE,T2.LSSETT),ANGRUP,ANSTGR`
        const result = await AS.query(query)
        AS.close()
        if (result) {
            return (result);
        }
        else {
            return { error: "error nella esecuzione della richiesta delle variazioni " }
        }
    }
    catch (err) {
        return { error: "error nella esecuzione della richiesta delle variazioni " + err }
    }

}

async function getDatiArticolo(codice, pv) {
    try {


        let originalCode = codice
        if (codice.length < 14) {
            const AS = await odbc.connect(connectionConfig)
            let tipo = ''
            //verifica se è stato passato un codice o un barcode
            const queryVerificaCodice = `select * from newstore.anart where ancodi = '${codice}'`
            const resultVerificaCodice = await AS.query(queryVerificaCodice).catch(err => { return { error: `articolo non trovato `, codice: originalCode } })
            if (resultVerificaCodice.count > 0) {
                tipo = 'ancodi'
            }
            else {
                codice = parseInt(codice.replace(/\D/g, ""));  // rimuovi i caratteri non numerici dal codice
                if (/\d+/.test(codice)) {
                    const queryVerificaBarcode = `select * from newstore.anart where anbaco = '${codice}'`
                    let resultVerificaBarcode = await AS.query(queryVerificaBarcode).catch(err => { console.log(err); return { error: `articolo non trovato `, codice: originalCode } })
                    if (resultVerificaBarcode[0]) {
                        tipo = 'anbaco'

                    } else {
                        tipo = 'notFound'
                        return { error: `articolo non trovato `, codice: originalCode }
                    }
                } else {
                    tipo = 'notFound'
                    return { error: ` articolo non trovato `, codice: originalCode }
                }
            }

            const query = `select newstore.anart.ancodi as codice,bremag.artic.anceur as codiceEuronics, newstore.anart.anbaco as barcode,newstore.anart.andesc as descrizione, prim_dat.march.mrdesc as marca,sbepomat.carbru.car01 as car1,sbepomat.carbru.car02 as car2,sbepomat.carbru.car03 as car3,sbepomat.carbru.car04 as car4,sbepomat.carbru.car05 as car5,sbepomat.carbru.car06 as car6,sbepomat.carbru.car07 as car7,sbepomat.carbru.car08 as car8,sbepomat.carbru.car09 as car9,sbepomat.carbru.car10 as car10,sbepomat.carbru.car11 as car11,sbepomat.carbru.car12 as car12,sbepomat.carbru.car13 as car13,sbepomat.carbru.car14 as car14,sbepomat.carbru.carprp as prezzoPrecedente, sbepomat.carbru.carprc as prezzoConsigliato, newstore.lipin.liprez as prezzo,newstore.lipid.liprez as prezzoFuturo, newstore.lipin.liprev as prezzoVantage,newstore.prmin.pmprez as prezzoMinimo from newstore.anart join prim_dat.march on mrcodi = newstore.anart.anmarc left join sbepomat.carbru on sbepomat.carbru.codbru= newstore.anart.ancodi join newstore.lipin on newstore.lipin.licodi=newstore.anart.ancodi join newstore.lipid on newstore.lipid.licodi=newstore.anart.ancodi join bremag.artic on bremag.artic.ancodi = newstore.anart.ancodi join newstore.prmin on newstore.prmin.pmcodi = newstore.anart.ancodi where newstore.anart.${tipo} = '${codice}' and newstore.lipin.lipven='${pv}'  and newstore.lipid.lipven='${pv}' and newstore.prmin.pmpven='${pv}'`

            const result = await AS.query(query).catch(err => { console.log(err) })
            AS.close()
            // console.log(result)
            if (result[0].CODICE) {
                result[0].icon = await getProductIcon(codice)
                result[0] = trimObjectFields(result[0])
                let linkImg = `https://ecat.euronics.it/ImageHttpHandler.ashx?operationcode=1&imageorder=0&usercode=${USERECAT}&ip=${IPECAT}&thumbnailsize=400&productcode=${result[0].CODICEEURONICS.trim()}`
                let linkEcat = 'https://qr.bruno.it/notFound.html'
                if (result[0].CODICEEURONICS) {
                    linkEcat = `https://ecat.euronics.it/ProductLabel.aspx?type=chkra&ip=${IPECAT}&user=${USERECAT}&product=${result[0].CODICEEURONICS.trim()}&operation=C`
                }

                result[0].IMGLINK = linkImg
                result[0].ECATLINK = linkEcat
                result[0].CARATTERISTICHE = mergeCARFields(result[0])
                // console.log(result[0])
                return (result[0]);
            }
            else {
                return { error: "errore acquisizione dati", codice: originalCode }
                //res.status(404).send("error nella esecuzione della richiesta informazioni bandierina");
            }

        } else {
            return { error: "supera la lunghezza massima ", codice: originalCode }
            // res.status(404).send("codice oltre il numero di caratteri consentito");

        }
    }
    catch (err) {
        console.log(err)
        logger.error(err)
        return { error: "errore acquisizione dati  per timeout ", codice: codice }
    }

}

async function getProductIcon(codice) {
    const AS = await odbc.connect(connectionConfig)
    const queryIcone = `Select * from BRUNOAPPS.BOMICO where PROCOD = '${codice}'`
    const resultQueryIcone = await AS.query(queryIcone)
    AS.close()
    if (resultQueryIcone[0]) {
        return resultQueryIcone[0]
    } else {
        return false
    }
}


// ottiene il prezzo attuale di un prodotto
let getActPrice = async (product) => {
    try {
        let AS = false
        AS = await odbc.connect(connectionConfig);
        const result = await AS.query(`select lacodi,lapvee from newstore.lisar where lacodi='${product}'`);
        AS.close();
        // console.log(result)
        if (result[0])
            return result[0].LAPVEE
        else return { error: "error ricerca prezzo" }
    } catch (err) {
        console.log(err);
    }
}

module.exports = {
    getActPrice: getActPrice,
    getDatiArticolo: getDatiArticolo,
    getVariazioniFunc: getVariazioniFunc
}