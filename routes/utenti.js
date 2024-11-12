require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL

let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient } = require('mongodb')


const { getEvent } = require('../database/utentiConnection')
const mongoClient = new MongoClient(mongoDbUrl)


// invio dati prodotto a ses
router.get('/getLastEvent', async (req, res, next) => {
    try {
        let user = req.user.username
        let pv = req.user.pv.sigla
        let getResult = await getEvent(mongoClient, user, pv)
        if (getResult[0]) {
            res.status(200).send(getResult)
        } else {
            res.status(400).send({ error: "errore nel recupero degli eventi" })
        }


    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})



module.exports = router;