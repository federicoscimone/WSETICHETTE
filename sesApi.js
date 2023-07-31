require("dotenv").config();
const SESKEY = process.env.SESKEY

const logger = require('./logger');
const axios = require('axios');
const { getSesId } = require('./database/puntiVenditaConnection')


const getLabelsFromItem = async (client, siglapv, codice) => {
    try {
        let idSes = await getSesId(client, siglapv)
        let result = await axios.get(`https://api-eu.vusion.io/vcloud/v1/stores/${idSes}/items/${codice}?includes=matching.labels`, {
            headers: {
                'Ocp-Apim-Subscription-Key': SESKEY
            }
        }).catch(err => {
            logger.error(err)
            return err
        })
        return result

    } catch (err) {
        logger.error("errore " + err)
    }
}

module.exports = {
    getLabelsFromItem: getLabelsFromItem,
}