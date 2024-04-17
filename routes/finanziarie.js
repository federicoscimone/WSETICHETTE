require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient } = require('mongodb')
const { getFinanziarie, setFinanziaria, postFinanziaria, switchFinanziaria, deleteFinanziaria, postRegola, deleteRegola, getCurrentFin } = require('../database/finanziariaConnection')
const mongoClient = new MongoClient(mongoDbUrl)


router.get('/', async (req, res, next) => {
    try {
        const pv = req.query.pv
        let getResult = await getFinanziarie(mongoClient, pv)
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


router.get('/current', async (req, res, next) => {
    try {
        let pv = req.query.pv
        let getResult = await getCurrentFin(mongoClient, pv)

        if (getResult[0]) {

            res.status(200).send(getResult)
        } else {
            res.status(400).send({ error: "Nessuna finanziaria attiva trovata" })
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
        if (result.acknowledged) {
            if (result.modifiedCount) {
                logger.info(`${user} modifica finanziaria ${id}`)
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
        if (result.acknowledged) {
            if (result.insertedId) {
                logger.info(`${user} aggiunge finanziaria ${result.insertedId}`)
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
        if (result.acknowledged) {
            if (result.modifiedCount) {
                logger.info(`${user} cambia stato abilitazione finanziaria ${id}`)
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


router.delete('/:id', async (req, res, next) => {
    try {
        const id = req.params
        const user = req.user.username
        let result = await deleteFinanziaria(mongoClient, id)
        if (result.acknowledged) {
            logger.info(`${user} elimina finanziaria ${id}`)
            res.status(200).send({ msg: `Finanziaria ${id} eliminata` })
        } else {
            res.status(400).send({ error: "errore nella cancellazione della finanziaria" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})

router.put('/:id/regole', async (req, res, next) => {
    try {
        const id = req.params
        const user = req.user.username
        const regola = req.body
        let result = await postRegola(mongoClient, id, regola, user)
        if (result.acknowledged) {
            logger.info(`${user} aggiunge regola a finanziaria ${id}`)
            res.status(200).send({ msg: `${user} aggiunge regola a finanziaria ${id}` })
        } else {
            res.status(400).send({ error: "errore nell'aggiunta della regola" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


router.delete('/:id/regole', async (req, res, next) => {
    try {
        const id = req.params
        const user = req.user.username
        const regola = req.body
        let result = await deleteRegola(mongoClient, id, regola, user)
        if (result.acknowledged) {
            logger.info(`${user} elimina regola per finanziara ${id}`)
            res.status(200).send({ msg: `regola finanziaria ${id} eliminata` })
        } else {
            res.status(400).send({ error: "errore nella cancellazione della regola finanziaria" })
        }
    } catch (err) {
        console.log(err)
        logger.error(err)
    }
})


module.exports = router;