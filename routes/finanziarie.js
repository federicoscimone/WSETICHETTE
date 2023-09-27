require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient } = require('mongodb')
const { getFinanziarie } = require('../database/finanziariaConnection')
const mongoClient = new MongoClient(mongoDbUrl)


router.get('/', async (req, res, next) => {
    try {
        let getResult = await getFinanziarie(mongoClient)
        if (getResult[0]) {
            res.status(200).send(getResult)
        } else {
            res.status(400).send({ error: "errore nel recupero delle finanziarie" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

module.exports = router;