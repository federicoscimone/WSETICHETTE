//recupero variabili di MODE
require("dotenv").config();
const PORT = process.env.PORT;
const tokenKey = process.env.TOKEN_KEY
const tokenLife = process.env.TOKEN_LIFE
const MODE = process.env.MODE
const WSIURL = process.env.WSIURL

const fs = require('fs');
const { authenticateJWT, ldapAuthentication, getRole, getPV, syncUtente, generaTokenWSI, getPvDict } = require('./routingUtility')

let debug = require('debug')('backend:server');
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
let bodyParser = require("body-parser");
const cors = require("cors");

//let https = require('https');
let http = MODE === 'DEV' ? require('http') : require('https');

const options = {
    key: fs.readFileSync('/cert/brunoapps.com/key.key'),
    cert: fs.readFileSync('/cert/brunoapps.com/cert.crt'),
    ca: fs.readFileSync('/cert/brunoapps.com/ca.crt')
};
const requestIp = require('request-ip');


let morgan = require('morgan');
const logger = require('./logger');

const morganMiddleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    {
        stream: {
            write: (message) => logger.http(message.trim()),
        },
    }
);

const etichette = require('./routes/etichette')
const utenti = require('./routes/utenti')
const finanziarie = require('./routes/finanziarie')
//const bandierineRouter = require('./routes/bandierine')
app.use(morgan('dev'));
app.use(morganMiddleware);

//let server = https.createServer(options, app);
let server = MODE === 'DEV' ? http.createServer(app) : http.createServer(options, app)

server.on('error', onError);
server.on('listening', onListening);

app.use(requestIp.mw())
app.use(cors());


app.use(bodyParser.urlencoded({
    extended: false,
    limit: '50mb',
    parameterLimit: 10000000,
}));
app.use(bodyParser.json());




//LDAP LOGIN
app.post("/ldapLogin", async (req, res) => {
    try {
        let password = req.body.password
        let username = req.body.username
        let loggedUser = {}
        if (!password || !username) {
            return res.status(403).json({ "error": 'dati accesso mancanti' })
        } else {
            let user = await ldapAuthentication(username, password)
            if (!user) {
                logger.error("ERRORE AUTENTICAZIONE " + username)
                res.status(403).json({ "error": 'Credenziali non valide' })
            }
            else {
                let groups = ""
                if (user.memberOf) {
                    if (typeof (user.memberOf) !== "string") {
                        groups = user.memberOf.map(e => e.split(',')).map(e => e[0].slice(3))
                    } else {
                        groups = [user.memberOf.split(',')[0].slice(3)]
                    }
                }
                let pv = ""
                let role = ""
                if (groups) {
                    pv = await getPV(groups)
                    role = getRole(groups)
                } else {
                    logger.error("ERRORE AUTENTICAZIONE - no auth " + username)
                    res.status(403).json({ "error": 'Non autorizzato' })
                }
                if (!role) {
                    logger.error("ERRORE AUTENTICAZIONE - no auth " + username)
                    res.status(403).json({ "error": 'Non autorizzato' })
                }

                let wsi = await generaTokenWSI(username, password)
                if (wsi) {
                    loggedUser.WSIToken = wsi.data.token
                    loggedUser.WSIURL = WSIURL
                }

                loggedUser.role = role
                loggedUser.username = username
                loggedUser.pv = pv
                syncUtente(loggedUser)
                jwt.sign(loggedUser, tokenKey, { expiresIn: tokenLife }, (err, token) => {
                    loggedUser.token = token
                    logger.info(new Date().toUTCString() + " Login by " + loggedUser.username)
                    req.user = loggedUser
                    res.status(202).json(loggedUser)
                })
            }
        }
    }
    catch (err) {
        console.log(err)
        logger.error("errore " + err)
    }
})


//route di base per test
app.get('/', authenticateJWT, (req, res, next) => {
    logger.info("GET / - remote address: " + req.socket.remoteAddress)
    res.send('Hello from Bruno Web Service!');
});

app.get("/pvdict", authenticateJWT, async (req, res) => {
    try {
        let filter = req.query.filter
        let pvdict = await getPvDict(filter)
        res.status(202).json(pvdict)
    } catch (err) { console.log(err) }
})

app.get('/checkUser', authenticateJWT, function (req, res, next) {
    res.send(req.user);
})

app.use('/etichette', authenticateJWT, etichette)
app.use('/utenti', authenticateJWT, utenti)
app.use('/finanziarie', authenticateJWT, finanziarie)
//app.use('/bandierine', authenticateJWT, bandierineRouter)

app.use((req, res, next) => {
    res.status(404).json({ "error": '404 percorso non trovato' });
});


/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = typeof PORT === 'string'
        ? 'Pipe ' + PORT
        : 'Port ' + PORT;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            logger.info(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */


function onListening() {
    let addr = server.address();
    let bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    debug('Listening on ' + bind);
    logger.info("In ascolto su porta: " + PORT)
}

if (process.env.MODE === 'DEV') server.listen(PORT);

else {
    // server.listen(PORT, "etichette.brunoapps.com");
    server.listen(PORT, "10.1.108.231");
    server.addContext('etichette.bruno.it', options)
}



