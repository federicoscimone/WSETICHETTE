require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient } = require('mongodb')
const { getFinanziarie, setFinanziaria, postFinanziaria, switchFinanziaria } = require('../database/finanziariaConnection')
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

router.put('/:id', async (req, res, next) => {
    try {
        const id = req.params
        const finanziaria = req.body
        const user = req.user.username

        let result = await setFinanziaria(mongoClient, id, finanziaria, user)
        console.log(result)
        if (result.acknowledged) {
            if (result.modifiedCount) {
                res.status(200).send(result)
            } else {
                res.status(400).send({ error: "nessuna modifica applicata" })
            }

        } else {
            res.status(400).send({ error: "errore nel aggiornamento della finanziaria" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


router.post('/', async (req, res, next) => {
    try {
        const finanziaria = req.body
        const user = req.user.username
        let result = await postFinanziaria(mongoClient, finanziaria, user)
        console.log(result)
        if (result.acknowledged) {
            if (result.insertedId) {
                res.status(200).send(result)
            } else {
                res.status(400).send({ error: "nessuna finanziaria inserita" })
            }

        } else {
            res.status(400).send({ error: "errore nell'inserimento di una finanziaria" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


router.put('/switch/:id', async (req, res, next) => {
    try {
        const id = req.params
        const user = req.user.username

        let result = await switchFinanziaria(mongoClient, id, user)
        console.log(result)
        if (result.acknowledged) {
            if (result.modifiedCount) {
                res.status(200).send(result)
            } else {
                res.status(400).send({ error: "nessuno switch applicato" })
            }

        } else {
            res.status(400).send({ error: "errore nello switch della finanziaria" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

module.exports = router;